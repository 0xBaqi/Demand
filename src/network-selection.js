import {getActiveNetworkConfig} from './network-config.js';
import {ensureWalletNetwork} from './wallet-session.js';

export function networkSelectionFromUrl(currentUrl) {
  const selected=new URL(currentUrl).searchParams.get('network');
  return ['robinhood','arbitrum'].includes(selected)?selected:'robinhood';
}

export async function prepareNetworkSelection({selected,currentUrl,ethereum,connected}) {
  const network=getActiveNetworkConfig(selected);
  if(connected){
    if(!ethereum)throw new Error('Wallet connection is unavailable.');
    const chainId=await ethereum.request({method:'eth_chainId'});
    if(BigInt(chainId)!==BigInt(network.chainId))await ensureWalletNetwork(ethereum,network);
  }
  const destination=new URL(currentUrl);
  destination.searchParams.set('network',selected);
  destination.hash='board';
  return destination.toString();
}
