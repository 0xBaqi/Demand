import {demandStatus} from './market-data.js';

export function supplierOpportunities(records,now) {
  return records.filter(record=>[0,1].includes(demandStatus(record.demand,now))).sort((first,second)=>demandStatus(second.demand,now)-demandStatus(first.demand,now)||second.demandId-first.demandId);
}
