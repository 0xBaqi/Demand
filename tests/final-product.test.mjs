import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getActiveNetworkConfig} from '../src/network-config.js';
import {networkSelectionFromUrl,prepareNetworkSelection} from '../src/network-selection.js';
import {supplierOpportunities} from '../src/board-view.js';
import {renderDemandCard} from '../src/demand-card.js';

const wallet='0x1111111111111111111111111111111111111111';
const currentUrl='http://127.0.0.1:5175/?network=robinhood';
const robinhood=getActiveNetworkConfig();
const arbitrum=getActiveNetworkConfig('arbitrum');
function record(demandId,status,deadline=2000){return {demandId,contribution:0n,demand:{creator:wallet,supplier:wallet,metadata:'Laundry',status,deadline,target:1000000n,totalCommitted:status===0?0n:1000000n,escrow:status===0?0n:1000000n}};}
function card(status,perspective='supplier',deadline=2000){return renderDemandCard({...record(1,status,deadline),now:1000,decimals:6,offers:new Map(),perspective,account:wallet,explorer:robinhood.explorer});}

test('the unified frontend defaults to Robinhood and both configurations remain independent',()=>{
  assert.equal(networkSelectionFromUrl('https://demand.example/'),'robinhood');
  assert.equal(networkSelectionFromUrl('https://demand.example/?network=arbitrum'),'arbitrum');
  assert.equal(networkSelectionFromUrl('https://demand.example/?network=unknown'),'robinhood');
  assert.equal(robinhood.chainId,46630);assert.equal(robinhood.deploymentBlock,128092099);
  assert.equal(arbitrum.chainId,421614);assert.equal(arbitrum.deploymentBlock,315158879);
  assert.notEqual(robinhood.token,arbitrum.token);assert.notEqual(robinhood.cacheKey,arbitrum.cacheKey);
});

test('disconnected users can change the board without requesting wallet access',async()=>{
  const destination=await prepareNetworkSelection({selected:'arbitrum',currentUrl,connected:false,ethereum:{request(){assert.fail('No wallet request allowed');}}});
  assert.equal(destination,'http://127.0.0.1:5175/?network=arbitrum#board');
});

test('authorized wallet selection switches chains before returning a reload destination',async()=>{
  const calls=[];let chain='0xb626';
  const ethereum={request:async request=>{calls.push(request.method);if(request.method==='eth_chainId')return chain;if(request.method==='wallet_switchEthereumChain')chain=request.params[0].chainId;}};
  const destination=await prepareNetworkSelection({selected:'arbitrum',currentUrl,ethereum,connected:true});
  assert.equal(chain,'0x66eee');assert.equal(networkSelectionFromUrl(destination),'arbitrum');
  assert.deepEqual(calls,['eth_chainId','wallet_switchEthereumChain','eth_chainId']);
  assert.ok(!calls.includes('eth_requestAccounts'));
});

test('already matching wallet chain does not request an unnecessary switch',async()=>{
  const calls=[];
  await prepareNetworkSelection({selected:'robinhood',currentUrl,connected:true,ethereum:{request:async request=>{calls.push(request.method);return '0xb626';}}});
  assert.deepEqual(calls,['eth_chainId']);
});

test('rejected wallet switches never produce a new board destination',async()=>{
  await assert.rejects(prepareNetworkSelection({selected:'arbitrum',currentUrl,connected:true,ethereum:{request:async request=>{if(request.method==='eth_chainId')return '0xb626';throw Object.assign(Error('Rejected'),{code:4001});}}}),/Rejected/);
  await assert.rejects(prepareNetworkSelection({selected:'other',currentUrl,connected:false}),/Unknown/);
});

test('wallet cannot report a successful switch while remaining on the wrong chain',async()=>{
  await assert.rejects(prepareNetworkSelection({selected:'arbitrum',currentUrl,connected:true,ethereum:{request:async request=>request.method==='eth_chainId'?'0xb626':undefined}}),/Select Arbitrum/);
});

test('supplier opportunities prioritize proven demand, exclude expired/selected/paid, and do not mutate records',()=>{
  const records=[record(1,0),record(2,1),record(3,2),record(4,4),record(5,1,900),record(6,0),record(7,1)];
  assert.deepEqual(supplierOpportunities(records,1000).map(item=>item.demandId),[7,2,6,1]);
  assert.deepEqual(records.map(item=>item.demandId),[1,2,3,4,5,6,7]);
});

test('supplier gathering cards show remaining capital/deadline without premature offer or buyer backing actions',()=>{
  const rendered=card(0);
  assert.match(rendered,/Remaining capital/);assert.match(rendered,/1 USDG/);assert.match(rendered,/Supplier acceptance deadline/);
  assert.doesNotMatch(rendered,/data-action="(offer|back)"/);assert.doesNotMatch(rendered,/proof-moment/);
  assert.match(card(0,'buyer'),/data-action="back"/);
});

test('the proven product moment reflects funded state and keeps creator-only acceptance',()=>{
  const rendered=card(1);
  assert.match(rendered,/Demand proven/);assert.match(rendered,/proof-moment/);assert.match(rendered,/Committed capital proves/);
  assert.match(rendered,/Respond to proven demand/);assert.match(rendered,/data-action="offer"/);assert.match(rendered,/data-action="accept"/);
  assert.doesNotMatch(card(1,'supplier',900),/data-action="offer"|proof-moment/);
  assert.doesNotMatch(rendered,/\d+ backers|cross-chain|trustless/i);
});
