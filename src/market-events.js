export const DEPLOYMENT_BLOCK = 315158879;
export const LOG_CHUNK_SIZE = 2000;

export async function queryMarketEvents(market, filter, latestBlock, {deploymentBlock = DEPLOYMENT_BLOCK, fromBlock = deploymentBlock} = {}) {
  if (!Number.isSafeInteger(latestBlock) || latestBlock < 0) {
    throw new Error('Invalid latest block');
  }
  if (!Number.isSafeInteger(deploymentBlock) || deploymentBlock < 0) throw new Error('Invalid deployment block');
  if (!Number.isSafeInteger(fromBlock) || fromBlock < deploymentBlock) throw new Error('Invalid starting block');
  const events = [];
  for (let batchStart = fromBlock; batchStart <= latestBlock; batchStart += LOG_CHUNK_SIZE * 4) {
    const requests = [];
    for (let chunkStart = batchStart; chunkStart <= Math.min(latestBlock,batchStart+LOG_CHUNK_SIZE*4-1); chunkStart += LOG_CHUNK_SIZE) {
      requests.push(market.queryFilter(filter,chunkStart,Math.min(chunkStart+LOG_CHUNK_SIZE-1,latestBlock)));
    }
    events.push(...(await Promise.all(requests)).flat());
  }
  return events;
}

export function createEventCache(market, storage, key, {deploymentBlock = DEPLOYMENT_BLOCK} = {}) {
  if (!Number.isSafeInteger(deploymentBlock) || deploymentBlock < 0) throw new Error('Invalid deployment block');
  let events=[],lastBlock=deploymentBlock-1;
  try {
    const saved=JSON.parse(storage?.getItem(key) || 'null');
    if(saved?.version===1 && Number.isSafeInteger(saved.lastBlock) && saved.lastBlock>=lastBlock && Array.isArray(saved.events) && saved.events.every(event=>Number.isSafeInteger(event.blockNumber) && event.blockNumber>=deploymentBlock && event.blockNumber<=saved.lastBlock && Array.isArray(event.topics) && typeof event.data==='string' && (!market.interface || market.interface.parseLog(event)))) {
      events=saved.events;lastBlock=saved.lastBlock;
    }
  }catch{}
  return {
    current(){return events;},
    async load(latestBlock){
      const fromBlock=Math.max(deploymentBlock,Math.min(lastBlock,latestBlock)-11);
      const incoming=await queryMarketEvents(market,'*',latestBlock,{fromBlock,deploymentBlock});
      const retained=events.filter(event=>event.blockNumber<fromBlock);
      events=[...retained,...incoming.map(event=>({blockNumber:event.blockNumber,index:event.index,transactionHash:event.transactionHash,data:event.data,topics:[...event.topics]}))];
      lastBlock=latestBlock;
      try{storage?.setItem(key,JSON.stringify({version:1,lastBlock,events}));}catch{}
      return events;
    }
  };
}
