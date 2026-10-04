export function getNetworkConfig(environment={}) {
  const selected=environment.VITE_NETWORK||'arbitrum';
  if(!['arbitrum','robinhood'].includes(selected))throw new Error('Unknown preview network');
  const robinhood=selected==='robinhood';
  const deploymentBlock=robinhood?Number(environment.VITE_ROBINHOOD_DEPLOYMENT_BLOCK):315158879;
  const market=robinhood?environment.VITE_ROBINHOOD_MARKET_ADDRESS:environment.VITE_MARKET_ADDRESS;
  if(!market || !/^0x[0-9a-fA-F]{40}$/.test(market))throw new Error('Missing or invalid deployed marketplace configuration');
  if(!Number.isSafeInteger(deploymentBlock) || deploymentBlock<1)throw new Error('Missing or invalid deployment block');
  const network={
    chainId:robinhood?46630:421614,
    name:robinhood?'Robinhood Chain Testnet':'Arbitrum Sepolia',
    label:robinhood?'Robinhood Chain':'Arbitrum',
    rpc:robinhood?'https://rpc.testnet.chain.robinhood.com':'https://sepolia-rollup.arbitrum.io/rpc',
    explorer:robinhood?'https://explorer.testnet.chain.robinhood.com':'https://sepolia.arbiscan.io',
    token:robinhood?'0x7E955252E15c84f5768B83c41a71F9eba181802F':'0xFFC95faa3d63Cde504a05B567C600B78C0b41892',
    market,deploymentBlock
  };
  return {...network,chainHex:`0x${network.chainId.toString(16)}`,cacheKey:`demandmarket:${network.chainId}:${market.toLowerCase()}:${deploymentBlock}:events-v1`};
}

export function getActiveNetworkConfig(selected='robinhood') {
  return getNetworkConfig({
    VITE_NETWORK:selected,
    VITE_MARKET_ADDRESS:'0x527f508C47ac108Ae4d048F2B8f787E091bDb604',
    VITE_ROBINHOOD_MARKET_ADDRESS:'0x527f508C47ac108Ae4d048F2B8f787E091bDb604',
    VITE_ROBINHOOD_DEPLOYMENT_BLOCK:'128092099'
  });
}
