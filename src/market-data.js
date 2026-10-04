export async function readDemandSnapshot(market, provider, account, minimumBlock=0) {
  const latestBlock=Math.max(await provider.getBlockNumber(),minimumBlock);
  const [countValue,block]=await Promise.all([market.demandCount({blockTag:latestBlock}),provider.getBlock(latestBlock)]);
  const count=Number(countValue);
  const ids=Array.from({length:Math.min(count,20)},(_,index)=>count-index);
  const records=await readDemandRecords(market,ids,latestBlock,account);
  return {latestBlock,now:block.timestamp,count,records};
}

export async function readDemandRecords(market,ids,blockTag,account) {
  const records=[];
  for(let start=0;start<ids.length;start+=4){
    records.push(...await Promise.all(ids.slice(start,start+4).map(async demandId=>{
      const [demand,contribution]=await Promise.all([market.demands(demandId,{blockTag}),account?market.contributions(demandId,account,{blockTag}):Promise.resolve(0n)]);
      return {demandId,demand,contribution};
    })));
  }
  return records;
}

export function decodeEvents(market,logs) {
  return logs.map(log=>{const event=market.interface.parseLog(log);return {...event,blockNumber:log.blockNumber,index:log.index};});
}

export function activityRoles(record,events,account) {
  if(!account)return [];
  const matches=address=>address?.toLowerCase()===account.toLowerCase();
  const relevant=events.filter(event=>Number(event.args.demandId)===record.demandId);
  const roles=[];
  if(matches(record.demand.creator))roles.push('created');
  if(record.contribution>0n || relevant.some(event=>event.name==='Backed' && matches(event.args.backer)))roles.push('backed');
  if(relevant.some(event=>event.name==='Offered' && matches(event.args.supplier)))roles.push('offered');
  if(matches(record.demand.supplier) || relevant.some(event=>event.name==='Accepted' && matches(event.args.supplier)))roles.push('supplied');
  return roles;
}

export function activityDemandIds(events,account) {
  if(!account)return [];
  const relevant=events.filter(event=>['creator','backer','supplier'].some(field=>event.args[field]?.toLowerCase()===account.toLowerCase()));
  return [...new Set(relevant.map(event=>Number(event.args.demandId)))].sort((first,second)=>second-first);
}

export function demandStatus(demand,now){const status=Number(demand.status);return [0,1,5].includes(status) && now>=Number(demand.deadline)?5:status;}
