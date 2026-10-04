import {test} from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import fs from 'node:fs';
import path from 'node:path';
import {BrowserProvider,ContractFactory} from 'ethers';
import {compile} from '../scripts/compile.mjs';
compile();
fs.mkdirSync('work', {recursive: true});
process.env.TEMP = path.resolve('work');
process.env.TMP = path.resolve('work');
async function fixture() {
  const transport = ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai'}});
  const provider = new BrowserProvider(transport, undefined, {cacheTimeout: -1, polling: true});
  provider.pollingInterval = 10;
  const creator = await provider.getSigner(0), backer = await provider.getSigner(1), supplier = await provider.getSigner(2);
  async function deploy(name,args=[]) {
    const artifact = JSON.parse(fs.readFileSync(`artifacts/${name}.json`));
    const contract = await new ContractFactory(artifact.abi,artifact.bytecode,creator).deploy(...args);
    await contract.waitForDeployment(); return contract;
  }
  const token = await deploy('MockUSDG');
  const market = await deploy('DemandMarket',[await token.getAddress()]);
  await (await token.transfer(await backer.getAddress(),1000n)).wait();
  for (const signer of [creator,backer]) await (await token.connect(signer).approve(await market.getAddress(),100000n)).wait();
  const latest = await provider.getBlock('latest');
  await (await market.createDemand('24-hour laundry pickup at UNILAG',100n,latest.timestamp+3600)).wait();
  return {transport,creator,backer,supplier,token,market};
}
test('variable contributions, strict cap, exact target closes funding',async()=>{
  const {transport,backer,market,token}=await fixture();
  try {
    await assert.rejects(market.backDemand(1,0));
    await (await market.backDemand(1,23)).wait();
    await assert.rejects(market.connect(backer).backDemand(1,78));
    assert.equal((await market.demands(1)).totalCommitted,23n);
    await (await market.connect(backer).backDemand(1,77)).wait();
    assert.equal((await market.demands(1)).status,1n);
    assert.equal(await market.totalEscrow(),100n);
    assert.equal(await token.balanceOf(await market.getAddress()),100n);
    await assert.rejects(market.backDemand(1,1));
  } finally {await transport.disconnect();}
});
test('partial funding expires; each backer gets exact amount once',async()=>{
  const {transport,creator,backer,market,token}=await fixture();
  try {
    await (await market.backDemand(1,20)).wait();
    await (await market.connect(backer).backDemand(1,30)).wait();
    await assert.rejects(market.refund(1));
    await transport.request({method:'evm_increaseTime',params:[3600]});
    await transport.request({method:'evm_mine',params:[]});
    await assert.rejects(market.backDemand(1,1));
    const before = await token.balanceOf(await creator.getAddress());
    await (await market.refund(1,{gasLimit:250000})).wait();
    assert.equal(await token.balanceOf(await creator.getAddress()),before+20n);
    await assert.rejects(market.refund(1));
    await (await market.connect(backer).refund(1)).wait();
    assert.equal(await token.balanceOf(await backer.getAddress()),1000n);
    assert.equal(await market.totalEscrow(),0n);
    assert.equal((await market.demands(1)).escrow,0n);
  } finally {await transport.disconnect();}
});
test('fully funded demand without accepted supplier remains refundable',async()=>{
  const {transport,market,supplier}=await fixture();
  try {
    await (await market.backDemand(1,100)).wait();
    await (await market.connect(supplier).submitOffer(1,'Pickup within 24 hours')).wait();
    await transport.request({method:'evm_increaseTime',params:[3600]});
    await transport.request({method:'evm_mine',params:[]});
    await assert.rejects(market.acceptSupplier(1,await supplier.getAddress()));
    await (await market.refund(1)).wait();
    assert.equal(await market.totalEscrow(),0n);
  } finally {await transport.disconnect();}
});
test('supplier fulfillment and creator settlement pay once; accepted funds cannot refund',async()=>{
  const {transport,market,backer,supplier,token}=await fixture();
  try {
    await assert.rejects(market.connect(supplier).submitOffer(1,'Early'));
    await (await market.backDemand(1,100)).wait();
    await assert.rejects(market.acceptSupplier(1,await supplier.getAddress()));
    await (await market.connect(supplier).submitOffer(1,'Pickup within 24 hours')).wait();
    await assert.rejects(market.connect(backer).acceptSupplier(1,await supplier.getAddress()));
    await (await market.acceptSupplier(1,await supplier.getAddress())).wait();
    await assert.rejects(market.settle(1));
    await assert.rejects(market.markFulfilled(1));
    await transport.request({method:'evm_increaseTime',params:[3600]});
    await transport.request({method:'evm_mine',params:[]});
    await assert.rejects(market.refund(1));
    await (await market.connect(supplier).markFulfilled(1)).wait();
    await assert.rejects(market.connect(supplier).settle(1));
    await (await market.settle(1,{gasLimit:250000})).wait();
    assert.equal(await token.balanceOf(await supplier.getAddress()),100n);
    assert.equal(await market.totalEscrow(),0n);
    await assert.rejects(market.settle(1));
  } finally {await transport.disconnect();}
});
