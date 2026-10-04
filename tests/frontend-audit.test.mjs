import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEventCache,queryMarketEvents,DEPLOYMENT_BLOCK} from '../src/market-events.js';
import {activityRoles,activityDemandIds,readDemandSnapshot} from '../src/market-data.js';
import {restoreWalletSession} from '../src/wallet-session.js';

test('history queries are bounded to four parallel requests and remain ordered',async()=>{
  let active=0,maximum=0;
  const events=await queryMarketEvents({queryFilter:async(filter,from,to)=>{
    active++;maximum=Math.max(maximum,active);assert.ok(to-from<2000);
    await new Promise(resolve=>setTimeout(resolve,2));active--;return [{blockNumber:from}];
  }},'*',DEPLOYMENT_BLOCK+10000);
  assert.equal(maximum,4);
  assert.deepEqual(events.map(event=>event.blockNumber),Array.from({length:6},(_,index)=>DEPLOYMENT_BLOCK+index*2000));
});

test('persisted cache incrementally refreshes and replaces the reorg tail',async()=>{
  const values=new Map(),calls=[];
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  let logs=[{blockNumber:DEPLOYMENT_BLOCK+10,index:0,transactionHash:'old',data:'0x',topics:[]}];
  const market={queryFilter:async(filter,from,to)=>{calls.push([from,to]);return logs.filter(log=>log.blockNumber>=from && log.blockNumber<=to);}};
  await createEventCache(market,storage,'test').load(DEPLOYMENT_BLOCK+20);
  const restored=createEventCache(market,storage,'test');assert.equal(restored.current().length,1);
  logs=[{...logs[0],transactionHash:'replacement'}];
  assert.equal((await restored.load(DEPLOYMENT_BLOCK+25))[0].transactionHash,'replacement');
  assert.deepEqual(calls.at(-1),[DEPLOYMENT_BLOCK+9,DEPLOYMENT_BLOCK+25]);
});

test('failed cache queries do not advance the watermark; unavailable storage is optional',async()=>{
  const calls=[];let fail=true;
  const cache=createEventCache({queryFilter:async(filter,from)=>{calls.push(from);if(fail)throw Error('offline');return [];}},{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},'test');
  await assert.rejects(cache.load(DEPLOYMENT_BLOCK+20),/offline/);fail=false;
  await cache.load(DEPLOYMENT_BLOCK+20);assert.deepEqual(calls,[DEPLOYMENT_BLOCK,DEPLOYMENT_BLOCK]);
});

test('undecodable persisted logs are discarded and rebuilt from deployment',async()=>{
  const calls=[];
  const cache=createEventCache({interface:{parseLog(){throw Error('corrupt log');}},queryFilter:async(filter,from)=>{calls.push(from);return [];}},{getItem:()=>JSON.stringify({version:1,lastBlock:DEPLOYMENT_BLOCK+20,events:[{blockNumber:DEPLOYMENT_BLOCK,data:'bad',topics:[]}]})},'test');
  assert.deepEqual(cache.current(),[]);await cache.load(DEPLOYMENT_BLOCK+21);
  assert.deepEqual(calls,[DEPLOYMENT_BLOCK]);
});

test('created, refunded backing and supplier activity derive only from real wallet data',()=>{
  const account='0xAlice',record={demandId:1,demand:{creator:'0xALICE',supplier:'0xElse'},contribution:0n};
  const events=[{name:'Backed',args:{demandId:1n,backer:account}},{name:'Offered',args:{demandId:1n,supplier:account}},{name:'Created',args:{demandId:25n,creator:account}}];
  assert.deepEqual(activityRoles(record,events,account),['created','backed','offered']);
  assert.deepEqual(activityDemandIds(events,account),[25,1]);
  assert.deepEqual(activityRoles(record,events,'0xNobody'),[]);
});

test('board snapshot loads demand state without historical log queries',async()=>{
  const market={demandCount:async()=>1n,demands:async()=>({metadata:'Laundry'}),queryFilter(){assert.fail('Board must not scan logs');}};
  const snapshot=await readDemandSnapshot(market,{getBlockNumber:async()=>DEPLOYMENT_BLOCK+10,getBlock:async()=>({timestamp:123})});
  assert.equal(snapshot.records[0].demand.metadata,'Laundry');assert.equal(snapshot.records[0].contribution,0n);
});

test('wallet restoration reads only already-authorized accounts without requesting access',async()=>{
  for(const accounts of [[],['0xAlice']]){
    const calls=[];
    const restored=await restoreWalletSession({request:async request=>{calls.push(request.method);return accounts;}});
    assert.equal(restored,accounts[0]||null);assert.deepEqual(calls,['eth_accounts']);
  }
  assert.equal(await restoreWalletSession(undefined),null);
});
