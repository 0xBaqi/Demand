import {BrowserProvider,JsonRpcProvider,Contract,parseUnits,isAddress} from 'ethers';
import abi from './abi.json';
import './style.css';
import {createEventCache} from './market-events.js';
import {readDemandSnapshot,readDemandRecords,decodeEvents,activityRoles,activityDemandIds,demandStatus} from './market-data.js';
import {getInjectedWallet,restoreWalletSession,ensureWalletNetwork} from './wallet-session.js';
import {getActiveNetworkConfig} from './network-config.js';
import {networkSelectionFromUrl,prepareNetworkSelection} from './network-selection.js';
import {supplierOpportunities} from './board-view.js';
import {renderDemandCard,escapeHtml,shortAddress} from './demand-card.js';

const selectedNetwork=networkSelectionFromUrl(window.location.href);
const network=getActiveNetworkConfig(selectedNetwork);
const configured=network.market;
const usdGAddress=network.token;
const explorer=network.explorer;
document.querySelector('#app').innerHTML=`
<header class="masthead"><a class="wordmark" href="#board">demand<span>↗</span></a><nav aria-label="Main navigation"><a id="explore" href="#board" aria-current="page">Explore</a><button data-open-create>Create demand</button><button id="activity">My activity</button></nav><div class="header-tools"><div class="network"><label class="network-picker">Network<select id="network-select" aria-label="Active network"><option value="robinhood">Robinhood Chain Testnet</option><option value="arbitrum">Arbitrum Sepolia</option></select></label><details class="network-details"><summary>Details ↗</summary><div class="network-panel"><strong>${network.name}</strong><p>Testnet · Chain ${network.chainId}</p><a href="${explorer}/address/${configured}" target="_blank" rel="noopener noreferrer">View marketplace ↗</a><a href="${explorer}/token/${usdGAddress}" target="_blank" rel="noopener noreferrer">View USDG token ↗</a><label>Marketplace address<input id="address" value="${escapeHtml(configured)}" readonly></label><button id="load" class="button secondary">Reload board</button><p>Independent deployments. Demand and USDG stay on the selected network.</p></div></details></div><button id="connect" class="button wallet">Connect wallet ↗</button></div></header>
<main><section class="hero" aria-labelledby="hero-title"><div><p class="eyebrow"><span>✳</span> A MARKET THAT STARTS WITH YOU</p><h1 id="hero-title">Demand summons <em>supply.</em></h1></div><div class="hero-aside"><p>Back what you want.<br>Give someone a reason to make it.</p><p class="hero-explainer">Buyers put stable capital behind what they want before a supplier exists. Suppliers discover proven demand and respond.</p><button class="button primary" data-open-create>Create demand <span>↗</span></button></div></section><div class="mechanism" aria-label="How demand works"><span><b>01</b> Name what’s missing</span><span><b>02</b> Prove demand with capital</span><span><b>03</b> Suppliers answer demand</span></div>
<section class="board" id="board" aria-labelledby="board-title"><div class="board-heading"><div><p class="eyebrow" id="board-kicker">THE LIVE DEMAND BOARD</p><h2 id="board-title">What should exist next?</h2></div><div class="board-tools"><span id="board-meta">Reading the marketplace…</span><button id="refresh" class="text-button">Refresh ↻</button></div></div><div id="demands" class="demand-grid" aria-live="polite"><div class="empty-state"><span class="empty-mark">↗</span><h3>Listening for demand.</h3><p>Loading real commitments from the marketplace.</p></div></div></section><aside class="trust-note"><span>Commitment, with a clear destination.</span><p>The selected supplier reports delivery; the creator confirms payment. If no supplier is accepted before the deadline, backers can reclaim their USDG. This MVP has no dispute resolution.</p></aside><div class="notice" id="notice" role="status" aria-live="polite">${network.name}${network.chainId===46630?'':' testnet'}. ${import.meta.env.VITE_DEMO_TOKEN==='true'?'Demo USDG token.':network.chainId===46630?'Official Paxos test USDG.':'Organizer USDG.'}</div></main>
<footer><a class="wordmark" href="#board">demand<span>↗</span></a><p>Supply follows conviction.</p><span>Built on ${network.label} · Testnet</span></footer>
<dialog id="create-dialog" aria-labelledby="create-title"><div class="dialog-heading"><span class="eyebrow">MAKE THE FIRST MOVE</span><button class="close-button" id="close-dialog" aria-label="Close create demand">×</button></div><h2 id="create-title">What do you wish<br>someone would make?</h2><p class="dialog-intro">Give your community a clear target to get behind.</p><form id="create"><label>Your demand<input name="title" maxlength="512" placeholder="24-hour laundry pickup at UNILAG" required></label><div class="form-row"><label>Funding target <span>USDG</span><input name="target" type="number" min="0.000001" step="0.000001" placeholder="100" required></label><label>Supplier acceptance deadline<input name="deadline" type="datetime-local" required></label></div><p class="field-help">Deadline for funding and supplier selection. Creating a demand needs test ETH for gas, not USDG.</p><button class="button primary full-width">Put it on the board <span>↗</span></button></form><p class="disclosure">The creator selects the supplier and confirms payment. Once a supplier is accepted, this MVP has no dispute process or timeout refund.</p></dialog>`;

const readProvider=new JsonRpcProvider(network.rpc,network.chainId,{staticNetwork:true});
const tokenAbi=['function decimals() view returns(uint8)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)'];
let market,token,decimals=6,signer,account,busy=false,lastTransactionHash,activityOnly=false,refreshVersion=0;
let eventCache,eventFlight,snapshot,historyEvents=[],historyError,boardFilter='all',activityFilter='all',perspective='buyer',switchingNetwork=false;
let injectedWallet;
document.querySelector('#explore').textContent='Demand board';
document.querySelector('#network-select').value=selectedNetwork;
document.querySelector('.board-heading').insertAdjacentHTML('afterend','<div class="perspective-tabs" aria-label="Board perspective"><button data-perspective="buyer" aria-pressed="true">I want something</button><button data-perspective="supplier" aria-pressed="false">I can supply</button></div><p id="board-context" class="board-context">Buyers → capitalized demand → supplier.</p>');
document.querySelector('.board-heading').insertAdjacentHTML('afterend','<div class="view-filters"><label id="board-filter-label">Show <select id="board-filter"><option value="all">All demand</option><option value="0">Gathering demand</option><option value="1">Demand proven</option><option value="4">Delivered & paid</option></select></label><div id="activity-filters" hidden><button data-activity-filter="all" aria-pressed="true">All activity</button><button data-activity-filter="created">Created</button><button data-activity-filter="backed">Backed</button><button data-activity-filter="offered">Offered</button><button data-activity-filter="supplied">Supplied</button></div><span id="activity-summary"></span></div>');
const notice=document.querySelector('#notice');
const dialog=document.querySelector('#create-dialog');
const dialogNotice=document.createElement('div');
dialogNotice.className='notice';dialogNotice.setAttribute('role','status');dialogNotice.setAttribute('aria-live','polite');dialogNotice.hidden=true;
document.querySelector('#create').insertAdjacentElement('afterend',dialogNotice);
function message(value){for(const target of [notice,dialogNotice]){target.textContent=value;if(lastTransactionHash){const link=document.createElement('a');link.href=`${explorer}/tx/${lastTransactionHash}`;link.target='_blank';link.rel='noopener noreferrer';link.textContent='View transaction ↗';target.append(' ',link);}}dialogNotice.hidden=!dialog.open;}
function errorText(error){return error.reason || error.shortMessage || error.message;}
function setBusy(value){busy=value;document.querySelectorAll('button').forEach(button=>button.disabled=value);document.querySelector('#network-select').disabled=value;}
async function loadMarket(){
  const address=document.querySelector('#address').value.trim();
  if(!isAddress(address) || address.toLowerCase()!==configured.toLowerCase())throw new Error('Use the configured deployed DemandMarket address.');
  market=new Contract(address,abi,readProvider);
  token=new Contract(usdGAddress,tokenAbi,readProvider);
  const [actualToken,tokenDecimals]=await Promise.all([market.token(),token.decimals()]);
  if(actualToken.toLowerCase()!==usdGAddress.toLowerCase())throw new Error('Marketplace token does not match configured USDG.');
  decimals=Number(tokenDecimals);
  let storage;try{storage=window.localStorage;}catch{}
  eventCache=createEventCache(market,storage,network.cacheKey,{deploymentBlock:network.deploymentBlock});
  historyEvents=decodeEvents(market,eventCache.current());
  await walletRestoration;await refresh();
}
async function connect(){
  const ethereum=getWallet();
  if(!ethereum)throw new Error('Use a browser with MetaMask or OKX Wallet enabled for this site to connect. You can explore without one.');
  await ethereum.request({method:'eth_requestAccounts'});
  await ensureWalletNetwork(ethereum,network);
  const walletProvider=new BrowserProvider(ethereum);signer=await walletProvider.getSigner();account=await signer.getAddress();
  document.querySelector('#connect').textContent=shortAddress(account);
  if(!token)await loadMarket();else await refresh();
  message('Wallet connected. You’re ready to make a move.');
}
async function transact(action){
  if(busy)return false;setBusy(true);
  try{
    if(!signer)await connect();
    await ensureWalletNetwork(getWallet(),network);
    if(!signer)await connect();
    message('Confirm in your wallet…');const transaction=await action();lastTransactionHash=transaction.hash;
    message('Submitted. Waiting for confirmation…');const receipt=await transaction.wait();message('Transaction confirmed.');
    try{await refresh(receipt.blockNumber);}catch(error){message(`Transaction confirmed; board refresh failed: ${errorText(error)}`);}return true;
  }catch(error){message(errorText(error));return false;}finally{setBusy(false);}
}
function renderBoard(){
  if(!snapshot)return;
  const cards=[],counts={created:0,backed:0,offered:0,supplied:0};
  const records=!activityOnly && perspective==='supplier'?supplierOpportunities(snapshot.records,snapshot.now):snapshot.records;
  for(const record of records){
    const roles=activityRoles(record,historyEvents,account);
    for(const role of roles)counts[role]++;
    if(activityOnly && (!roles.length || activityFilter!=='all' && !roles.includes(activityFilter)))continue;
    if(!activityOnly && boardFilter!=='all' && demandStatus(record.demand,snapshot.now)!==Number(boardFilter))continue;
    const offers=new Map(historyEvents.filter(event=>event.name==='Offered' && Number(event.args.demandId)===record.demandId).map(event=>[event.args.supplier,event.args.terms]));
    const card=renderDemandCard({...record,offers,account,decimals,now:snapshot.now,offersUnavailable:Boolean(historyError),explorer,perspective:activityOnly?'buyer':perspective});
    cards.push(activityOnly?card.replace('<h3>',`<p class="activity-roles">${roles.join(' · ')}</p><h3>`):card);
  }
  document.querySelector('#board-title').textContent=activityOnly?'Your demand, your moves.':perspective==='supplier'?'Find demand worth supplying.':'What should exist next?';
  document.querySelector('#board-kicker').textContent=activityOnly?'YOUR WALLET ACTIVITY':perspective==='supplier'?'SUPPLIER OPPORTUNITIES':'THE LIVE DEMAND BOARD';
  document.querySelector('#board-meta').textContent=`${cards.length} ${cards.length===1?'demand':'demands'} shown · ${network.name}${!activityOnly && snapshot.count>20?' · Latest 20':''}`;
  document.querySelector('#board-filter-label').hidden=activityOnly;
  document.querySelector('.perspective-tabs').hidden=activityOnly;
  document.querySelector('#board-context').hidden=activityOnly;
  document.querySelector('#board-context').textContent=perspective==='supplier'?'Discover what people want and the capital behind it. Respond when demand is proven.':'Buyers → capitalized demand → supplier.';
  document.querySelector('#board-filter option[value="4"]').hidden=perspective==='supplier';
  document.querySelector('#activity-filters').hidden=!activityOnly;
  document.querySelector('#activity-summary').textContent=activityOnly?`${counts.created} created · ${counts.backed} backed · ${counts.offered} offered · ${counts.supplied} supplied${eventFlight?' · Loading history…':''}`:'';
  document.querySelector('#demands').innerHTML=cards.join('')||`<div class="empty-state"><p class="eyebrow">${activityOnly?'YOUR ACTIVITY':'THE DEMAND BOARD'}</p><h3>${activityOnly?'No matching wallet activity.':perspective==='supplier'?'No matching supplier opportunities.':boardFilter==='all'?'Something missing? Put it here.':'No demands in this stage.'}</h3><p>${activityOnly?eventFlight?'Checking onchain activity. Created demands appear as soon as their state loads.':'Created, backed, offered and supplied demand will appear here.':perspective==='supplier'?'Gathering and proven demand appear here. Suppliers can respond only while proven demand is still open.':snapshot.count?'Choose another stage to see demand.':'Be the first to name what your community needs.'}</p><button class="button primary" data-open-create>Create demand ↗</button></div>`;
}
async function refresh(minimumBlock=0){
  if(!market)return;const version=++refreshVersion;
  const fresh=await readDemandSnapshot(market,readProvider,account,minimumBlock);
  if(version!==refreshVersion || switchingNetwork)return;
  snapshot=fresh;renderBoard();
  const needsHistory=activityOnly || fresh.records.some(record=>[1,2,3,4].includes(Number(record.demand.status)));
  if(!needsHistory)return;
  if(!eventFlight)eventFlight=eventCache.load(fresh.latestBlock);
  renderBoard();
  try{
    const logs=await eventFlight;
    if(version!==refreshVersion || switchingNetwork)return;
    historyEvents=decodeEvents(market,logs);historyError=undefined;
    if(activityOnly){
      const known=new Set(snapshot.records.map(record=>record.demandId));
      const missing=activityDemandIds(historyEvents,account).filter(demandId=>demandId>0 && demandId<=snapshot.count && !known.has(demandId));
      const older=await readDemandRecords(market,missing,snapshot.latestBlock,account);
      if(version!==refreshVersion || switchingNetwork)return;
      snapshot.records.push(...older);snapshot.records.sort((first,second)=>second.demandId-first.demandId);
    }
  }catch(error){historyError=errorText(error);message(`Demand is visible; historical activity or supplier responses could not load: ${historyError}`);}
  finally{eventFlight=undefined;if(version===refreshVersion)renderBoard();}
}

document.addEventListener('click',event=>{if(event.target.closest('[data-open-create]')){dialogNotice.hidden=true;dialog.showModal();document.querySelector('#create input').focus();}});
document.querySelector('#close-dialog').onclick=()=>dialog.close();
document.querySelector('#connect').onclick=()=>connect().catch(error=>message(errorText(error)));
document.querySelector('#load').onclick=()=>loadMarket().catch(error=>message(errorText(error)));
document.querySelector('#refresh').onclick=()=>refresh().catch(error=>message(errorText(error)));
document.querySelector('#explore').onclick=()=>{
  activityOnly=false;document.querySelector('#explore').setAttribute('aria-current','page');document.querySelector('#activity').removeAttribute('aria-current');
  if(snapshot && snapshot.records.length>20)snapshot.records=snapshot.records.slice(0,20);
  renderBoard();document.querySelector('#board').scrollIntoView({behavior:'smooth'});
};
document.querySelector('#network-select').onchange=async event=>{
  const control=event.target,requested=control.value;
  if(busy || requested===selectedNetwork){control.value=selectedNetwork;return;}
  switchingNetwork=true;setBusy(true);
  try{
    await walletRestoration;
    const destination=await prepareNetworkSelection({selected:requested,currentUrl:window.location.href,ethereum:getWallet(),connected:Boolean(account)});
    snapshot=undefined;historyEvents=[];refreshVersion++;document.querySelector('#demands').textContent='Loading the selected network…';
    window.location.assign(destination);
  }catch(error){control.value=selectedNetwork;message(`Network selection cancelled: ${errorText(error)}`);switchingNetwork=false;setBusy(false);}
};
document.querySelector('.perspective-tabs').onclick=event=>{
  const button=event.target.closest('[data-perspective]');if(!button || busy)return;
  perspective=button.dataset.perspective;activityOnly=false;boardFilter='all';document.querySelector('#board-filter').value='all';
  if(snapshot && snapshot.records.length>20)snapshot.records=snapshot.records.slice(0,20);
  document.querySelectorAll('[data-perspective]').forEach(control=>control.setAttribute('aria-pressed',String(control===button)));
  document.querySelector('#explore').setAttribute('aria-current','page');document.querySelector('#activity').removeAttribute('aria-current');renderBoard();
};

document.querySelector('#board-filter').onchange=event=>{boardFilter=event.target.value;renderBoard();};
document.querySelector('#activity-filters').onclick=event=>{
  const button=event.target.closest('[data-activity-filter]');if(!button)return;
  activityFilter=button.dataset.activityFilter;
  document.querySelectorAll('[data-activity-filter]').forEach(control=>control.setAttribute('aria-pressed',String(control===button)));renderBoard();
};
document.querySelector('#activity').onclick=async()=>{
  try{
    if(!account)await connect();activityOnly=true;
    document.querySelector('#explore').removeAttribute('aria-current');document.querySelector('#activity').setAttribute('aria-current','page');
    renderBoard();document.querySelector('#board').scrollIntoView({behavior:'smooth'});await refresh();
  }catch(error){message(errorText(error));}
};
document.querySelector('#create').onsubmit=async event=>{
  event.preventDefault();if(busy)return;const form=event.target,data=new FormData(form);
  const succeeded=await transact(()=>market.connect(signer).createDemand(data.get('title'),parseUnits(data.get('target'),decimals),Math.floor(new Date(data.get('deadline')).getTime()/1000)));
  if(succeeded){dialog.close();form.reset();document.querySelector('#board').scrollIntoView({behavior:'smooth'});}
};
document.querySelector('#demands').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;const form=event.target,data=new FormData(form),demandId=form.dataset.id;
  try{
    if(!signer)await connect();
    if(form.dataset.action==='back'){
      const amount=parseUnits(data.get('amount'),decimals),demand=await market.demands(demandId);
      if(amount<=0n || amount>demand.target-demand.totalCommitted)throw new Error('Choose a positive amount no greater than the remaining target.');
      if(await token.allowance(account,market.target)<amount){if(!await transact(()=>token.connect(signer).approve(market.target,amount)))return;}
      await transact(()=>market.connect(signer).backDemand(demandId,amount));
    }else if(form.dataset.action==='offer')await transact(()=>market.connect(signer).submitOffer(demandId,data.get('terms')));
    else if(form.dataset.action==='accept')await transact(()=>market.connect(signer).acceptSupplier(demandId,data.get('supplier')));
  }catch(error){message(errorText(error));}
});
document.querySelector('#demands').addEventListener('click',event=>{const button=event.target.closest('button[data-action]');if(!button)return;const methods={fulfill:'markFulfilled',settle:'settle',refund:'refund'};if(methods[button.dataset.action])transact(()=>market.connect(signer)[methods[button.dataset.action]](button.dataset.id));});
function getWallet(){
  if(injectedWallet)return injectedWallet;
  injectedWallet=getInjectedWallet(window);
  if(typeof injectedWallet?.on==='function'){
    injectedWallet.on('accountsChanged',accounts=>{account=accounts[0];signer=undefined;document.querySelector('#connect').textContent=account?shortAddress(account):'Connect wallet ↗';refresh().catch(error=>message(errorText(error)));});
    injectedWallet.on('chainChanged',()=>{signer=undefined;message(`Wallet network changed. The board remains on ${network.name}; connect on that network to transact.`);});
  }
  return injectedWallet;
}
const walletRestoration=restoreWalletSession(getWallet()).then(restored=>{account=restored || undefined;if(account)document.querySelector('#connect').textContent=shortAddress(account);}).catch(()=>{account=undefined;});
loadMarket().catch(error=>{document.querySelector('#board-meta').textContent='Connection interrupted';document.querySelector('#demands').innerHTML='<div class="empty-state"><h3>The board couldn’t load.</h3><p>Check your connection and choose Reload board in the network menu.</p></div>';message(errorText(error));});
