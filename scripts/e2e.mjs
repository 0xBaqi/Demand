import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JsonRpcProvider,Wallet,NonceManager,Contract,parseUnits,formatUnits} from 'ethers';
import {verifyDeployment} from './verify-deployment.mjs';

const provider=new JsonRpcProvider(process.env.ARBITRUM_RPC || 'https://sepolia-rollup.arbitrum.io/rpc');
const recordFile='submission-transactions.json';
try {
  assert.ok(process.env.DEPLOYER_PRIVATE_KEY && process.env.SUPPLIER_PRIVATE_KEY,'Configure both wallet keys locally using run-local.ps1 -Mode e2e');
  const deployment=JSON.parse(fs.readFileSync('deployment.json','utf8'));
  await verifyDeployment(provider,deployment);
  assert.equal(deployment.demoToken,false,'Organizer USDG required for this run');
  const creator=new NonceManager(new Wallet(process.env.DEPLOYER_PRIVATE_KEY,provider));
  const supplier=new NonceManager(new Wallet(process.env.SUPPLIER_PRIVATE_KEY,provider));
  const creatorAddress=await creator.getAddress(),supplierAddress=await supplier.getAddress();
  assert.notEqual(creatorAddress.toLowerCase(),supplierAddress.toLowerCase(),'Use distinct creator and supplier wallets');
  const token=new Contract(deployment.token,['function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)','event Transfer(address indexed from,address indexed to,uint256 value)'],creator);
  const market=new Contract(deployment.market,JSON.parse(fs.readFileSync('artifacts/DemandMarket.json','utf8')).abi,creator);
  const decimals=Number(await token.decimals());
  const target=parseUnits('1',decimals),first=parseUnits('0.4',decimals),second=target-first;
  let record=fs.existsSync(recordFile)?JSON.parse(fs.readFileSync(recordFile,'utf8')):{chainId:421614,market:deployment.market,token:deployment.token,deploymentTransaction:deployment.transaction,creator:creatorAddress,backer:creatorAddress,supplier:supplierAddress,targetUSDG:'1',transactions:{},complete:false};
  for(const [field,value] of Object.entries({market:deployment.market,creator:creatorAddress,supplier:supplierAddress})) assert.equal(record[field].toLowerCase(),value.toLowerCase(),`Existing record ${field} differs; do not overwrite it`);
  function save(){fs.writeFileSync(recordFile,JSON.stringify(record,null,2));}
  async function step(name,submit){
    let entry=record.transactions[name];
    if(!entry){const transaction=await submit();entry={hash:transaction.hash,url:`https://sepolia.arbiscan.io/tx/${transaction.hash}`};record.transactions[name]=entry;save();console.log(`${name}: ${entry.url}`);}
    const receipt=await provider.waitForTransaction(entry.hash,1,180000);
    assert.ok(receipt,`${name}: confirmation timeout; rerun to resume without duplicating`);
    assert.equal(receipt.status,1,`${name} reverted; investigate this public transaction before restarting`);
    entry.blockNumber=receipt.blockNumber;entry.status=receipt.status;save();return receipt;
  }
  if(record.complete){console.log('Recorded run already completed; no new transactions sent.');}
  else {
    for(const address of [creatorAddress,supplierAddress]) assert.ok(await provider.getBalance(address)>0n,`Fund ${address} with Arbitrum Sepolia ETH for gas`);
    const contributed=record.demandId?await market.contributions(record.demandId,creatorAddress):0n;
    const needed=target-contributed;
    const balance=await token.balanceOf(creatorAddress);
    console.log(`Creator/backer ${creatorAddress}: ${formatUnits(balance,decimals)} USDG. Supplier ${supplierAddress}.`);
    assert.ok(balance>=needed,`Ask organizers to send at least ${formatUnits(needed,decimals)} test USDG to ${creatorAddress} on Arbitrum Sepolia, token ${deployment.token}`);
    const creation=await step('createDemand',async()=>{
      const latest=await provider.getBlock('latest');
      return market.createDemand('Hackathon E2E: 24-hour laundry pickup at UNILAG',target,latest.timestamp+86400);
    });
    const created=creation.logs.map(log=>{try{return market.interface.parseLog(log);}catch{return null;}}).find(event=>event?.name==='Created');
    assert.ok(created,'Missing Created event');record.demandId=created.args.demandId.toString();save();
    const demandId=record.demandId;
    if(!record.transactions.approve && await token.allowance(creatorAddress,deployment.market)>=target){record.existingAllowance=true;save();}
    else if(!record.existingAllowance)await step('approve',()=>token.approve(deployment.market,target));
    await step('commit04USDG',()=>market.backDemand(demandId,first));
    if(!record.transactions.commit06USDG)assert.equal((await market.demands(demandId)).totalCommitted,first);
    await step('commit06USDG',()=>market.backDemand(demandId,second));
    if(!record.transactions.acceptSupplier){const funded=await market.demands(demandId);assert.equal(funded.totalCommitted,target);assert.equal(funded.status,1n);assert.equal(funded.escrow,target);}
    await step('supplierOffer',()=>market.connect(supplier).submitOffer(demandId,'Provide the agreed laundry pickup demo; creator confirms delivery.'));
    await step('acceptSupplier',()=>market.acceptSupplier(demandId,supplierAddress));
    await step('supplierMarksFulfilled',()=>market.connect(supplier).markFulfilled(demandId));
    if(record.supplierBalanceBeforeSettlement===undefined){record.supplierBalanceBeforeSettlement=(await token.balanceOf(supplierAddress)).toString();save();}
    const receipt=await step('creatorConfirmsAndSettles',()=>market.settle(demandId));
    const transfer=receipt.logs.filter(log=>log.address.toLowerCase()===deployment.token.toLowerCase()).map(log=>{try{return token.interface.parseLog(log);}catch{return null;}}).find(event=>event?.name==='Transfer' && event.args.from.toLowerCase()===deployment.market.toLowerCase() && event.args.to.toLowerCase()===supplierAddress.toLowerCase() && event.args.value===target);
    assert.ok(transfer,'Settlement receipt missing exact supplier USDG transfer');
    const settled=await market.demands(demandId);assert.equal(settled.status,4n);assert.equal(settled.escrow,0n);
    const after=await token.balanceOf(supplierAddress);
    assert.ok(after>=BigInt(record.supplierBalanceBeforeSettlement)+target,'Supplier balance did not increase by the payout');
    record.supplierBalanceAfterSettlement=after.toString();record.settlementUSDG=formatUnits(target,decimals);record.complete=true;record.completedAt=new Date().toISOString();save();
    fs.writeFileSync('HACKATHON-SUBMISSION.md',`# Verified Arbitrum Sepolia run\n\nChain: 421614\n\nMarket: https://sepolia.arbiscan.io/address/${deployment.market}\n\nOrganizer USDG: https://sepolia.arbiscan.io/token/${deployment.token}\n\nCreator/backer: ${creatorAddress}\n\nSupplier: ${supplierAddress}\n\nDemand: ${demandId}; target and settlement: 1 USDG\n\nDeployment: https://sepolia.arbiscan.io/tx/${deployment.transaction}\n\n${Object.entries(record.transactions).map(([name,entry])=>`- ${name}: ${entry.url}`).join('\n')}\n\nVerified: deployment input matches compiled contract and token constructor; every recorded transaction succeeded; demand Settled, escrow zero; exact 1 USDG supplier Transfer event and supplier balance increase.\n`);
    console.log('PASS: full real-testnet flow; exact 1 USDG supplier settlement. Public evidence saved.');
  }
} finally {provider.destroy();}
