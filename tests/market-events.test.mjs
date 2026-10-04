import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEPLOYMENT_BLOCK,LOG_CHUNK_SIZE,queryMarketEvents} from '../src/market-events.js';

test('log queries start at deployment and cover safe inclusive chunks without gaps',async()=>{
  const calls=[];
  const filter={event:'Offered'};
  const market={queryFilter:async(actualFilter,fromBlock,toBlock)=>{
    assert.equal(actualFilter,filter);
    calls.push([fromBlock,toBlock]);
    return [{blockNumber:fromBlock},{blockNumber:toBlock}];
  }};
  const latestBlock=DEPLOYMENT_BLOCK+LOG_CHUNK_SIZE*2+1;
  const events=await queryMarketEvents(market,filter,latestBlock);
  assert.deepEqual(calls,[[DEPLOYMENT_BLOCK,DEPLOYMENT_BLOCK+1999],[DEPLOYMENT_BLOCK+2000,DEPLOYMENT_BLOCK+3999],[DEPLOYMENT_BLOCK+4000,latestBlock]]);
  assert.deepEqual(events.map(event=>event.blockNumber),calls.flat());
});

test('deployment block alone is queried exactly once',async()=>{
  const calls=[];
  await queryMarketEvents({queryFilter:async(filter,fromBlock,toBlock)=>{calls.push([fromBlock,toBlock]);return [];}},{},DEPLOYMENT_BLOCK);
  assert.deepEqual(calls,[[DEPLOYMENT_BLOCK,DEPLOYMENT_BLOCK]]);
});

test('no query scans a chain height before deployment',async()=>{
  const market={queryFilter:async()=>{assert.fail('Unexpected predeployment query');}};
  assert.deepEqual(await queryMarketEvents(market,{},DEPLOYMENT_BLOCK-1),[]);
  await assert.rejects(queryMarketEvents(market,{},NaN),/Invalid latest block/);
});

test('RPC failure propagates so the UI can report unavailable offers',async()=>{
  const market={queryFilter:async()=>{throw new Error('RPC unavailable');}};
  await assert.rejects(queryMarketEvents(market,{},DEPLOYMENT_BLOCK),/RPC unavailable/);
});
