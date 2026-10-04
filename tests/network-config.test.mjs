import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getNetworkConfig} from '../src/network-config.js';
import {queryMarketEvents,createEventCache} from '../src/market-events.js';
import {ensureWalletNetwork} from '../src/wallet-session.js';
import {renderDemandCard} from '../src/demand-card.js';

const marketAddress='0x527f508C47ac108Ae4d048F2B8f787E091bDb604';
const arbitrum=getNetworkConfig({VITE_MARKET_ADDRESS:marketAddress});
const robinhood=getNetworkConfig({VITE_NETWORK:'robinhood',VITE_MARKET_ADDRESS:marketAddress,VITE_ROBINHOOD_MARKET_ADDRESS:marketAddress,VITE_ROBINHOOD_DEPLOYMENT_BLOCK:'128092099'});

test('Arbitrum defaults preserve original chain, token, deployment boundary and cache',()=>{
  assert.equal(arbitrum.chainId,421614);assert.equal(arbitrum.chainHex,'0x66eee');
  assert.equal(arbitrum.token,'0xFFC95faa3d63Cde504a05B567C600B78C0b41892');
  assert.equal(arbitrum.deploymentBlock,315158879);
  assert.equal(arbitrum.cacheKey,`demandmarket:421614:${marketAddress.toLowerCase()}:315158879:events-v1`);
});

test('Robinhood uses distinct chain/token/RPC/explorer/block/cache even with the same market address',()=>{
  assert.equal(robinhood.chainId,46630);assert.equal(robinhood.chainHex,'0xb626');
  assert.equal(robinhood.rpc,'https://rpc.testnet.chain.robinhood.com');
  assert.equal(robinhood.explorer,'https://explorer.testnet.chain.robinhood.com');
  assert.equal(robinhood.token,'0x7E955252E15c84f5768B83c41a71F9eba181802F');
  assert.equal(robinhood.deploymentBlock,128092099);assert.notEqual(robinhood.cacheKey,arbitrum.cacheKey);
});

test('Robinhood configuration fails closed rather than falling back to Arbitrum',()=>{
  assert.throws(()=>getNetworkConfig({VITE_NETWORK:'robinhood',VITE_MARKET_ADDRESS:marketAddress}),/marketplace configuration/);
  assert.throws(()=>getNetworkConfig({VITE_NETWORK:'robinhood',VITE_ROBINHOOD_MARKET_ADDRESS:marketAddress}),/deployment block/);
  assert.throws(()=>getNetworkConfig({VITE_NETWORK:'other',VITE_MARKET_ADDRESS:marketAddress}),/Unknown/);
});

test('Robinhood queries start at its lower deployment block and preserve bounded ranges',async()=>{
  const calls=[];
  await queryMarketEvents({queryFilter:async(filter,from,to)=>{calls.push([from,to]);return [];}},'*',robinhood.deploymentBlock+2001,{deploymentBlock:robinhood.deploymentBlock});
  assert.deepEqual(calls,[[128092099,128094098],[128094099,128094100]]);
  await assert.rejects(queryMarketEvents({},'*',128094100,{deploymentBlock:128092099,fromBlock:128092098}),/Invalid starting/);
});

test('same-address caches remain chain-separated and Robinhood scans incrementally',async()=>{
  const values=new Map(),calls=[];
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const market={queryFilter:async(filter,from,to)=>{calls.push([from,to]);return [];}};
  await createEventCache(market,storage,arbitrum.cacheKey,{deploymentBlock:arbitrum.deploymentBlock}).load(arbitrum.deploymentBlock+20);
  const original=values.get(arbitrum.cacheKey);
  await createEventCache(market,storage,robinhood.cacheKey,{deploymentBlock:robinhood.deploymentBlock}).load(robinhood.deploymentBlock+20);
  assert.equal(calls.at(-1)[0],robinhood.deploymentBlock);
  await createEventCache(market,storage,robinhood.cacheKey,{deploymentBlock:robinhood.deploymentBlock}).load(robinhood.deploymentBlock+25);
  assert.equal(calls.at(-1)[0],robinhood.deploymentBlock+9);assert.equal(values.get(arbitrum.cacheKey),original);
});

test('unknown wallet network is added only in the explicit connect workflow and checked',async()=>{
  const calls=[];
  await ensureWalletNetwork({request:async request=>{calls.push(request);if(calls.length===1)throw {code:4902};if(request.method==='eth_chainId')return '0xb626';}},robinhood);
  assert.deepEqual(calls.map(request=>request.method),['wallet_switchEthereumChain','wallet_addEthereumChain','wallet_switchEthereumChain','eth_chainId']);
  assert.equal(calls[1].params[0].chainId,'0xb626');assert.deepEqual(calls[1].params[0].rpcUrls,[robinhood.rpc]);
  await assert.rejects(ensureWalletNetwork({request:async request=>request.method==='eth_chainId'?'0x66eee':null},robinhood),/Select Robinhood/);
});

test('wallet rejection never triggers automatic network addition',async()=>{
  const calls=[];
  await assert.rejects(ensureWalletNetwork({request:async request=>{calls.push(request.method);throw Object.assign(Error('Rejected'),{code:4001});}},robinhood),/Rejected/);
  assert.deepEqual(calls,['wallet_switchEthereumChain']);
});

test('all Robinhood card address links use its explorer, not Arbitrum',()=>{
  const card=renderDemandCard({demandId:1,demand:{status:2,creator:marketAddress,supplier:marketAddress,target:1000000n,totalCommitted:1000000n,escrow:1000000n,deadline:200,metadata:'Laundry'},contribution:0n,offers:new Map([[marketAddress,'Delivery']]),decimals:6,now:100,explorer:robinhood.explorer});
  assert.ok(!card.includes('sepolia.arbiscan.io'));assert.equal((card.match(/https:\/\/explorer.testnet.chain.robinhood.com\/address\//g)||[]).length,3);
});
