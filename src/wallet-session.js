export function getInjectedWallet(browser) {
  return [browser.ethereum,browser.okxwallet].find(provider=>typeof provider?.request==='function');
}

export async function restoreWalletSession(ethereum) {
  if(!ethereum)return null;
  const accounts=await ethereum.request({method:'eth_accounts'});
  return accounts.length?accounts[0]:null;
}

export async function ensureWalletNetwork(ethereum,network) {
  const request={method:'wallet_switchEthereumChain',params:[{chainId:network.chainHex}]};
  try{await ethereum.request(request);}catch(error){
    if(error.code!==4902)throw error;
    await ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:network.chainHex,chainName:network.name,nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[network.rpc],blockExplorerUrls:[network.explorer]}]});
    await ethereum.request(request);
  }
  const actual=await ethereum.request({method:'eth_chainId'});
  if(BigInt(actual)!==BigInt(network.chainId))throw new Error(`Select ${network.name} before transacting.`);
}
