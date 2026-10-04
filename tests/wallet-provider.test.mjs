import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserProvider} from 'ethers';
import {getInjectedWallet,restoreWalletSession,ensureWalletNetwork} from '../src/wallet-session.js';
import {getActiveNetworkConfig} from '../src/network-config.js';
import {prepareNetworkSelection} from '../src/network-selection.js';
import {activityRoles} from '../src/market-data.js';

const account='0x1111111111111111111111111111111111111111';

test('MetaMask-style injection keeps precedence and OKX-only injection is detected',()=>{
  const ethereum={request(){}};
  const okxwallet={request(){}};
  assert.equal(getInjectedWallet({ethereum,okxwallet}),ethereum);
  assert.equal(getInjectedWallet({okxwallet}),okxwallet);
  assert.equal(getInjectedWallet({ethereum:{},okxwallet}),okxwallet);
  assert.equal(getInjectedWallet({}),undefined);
  assert.equal(getInjectedWallet({okxwallet:{}}),undefined);
});

test('late OKX injection can be detected without requesting permission on page load',async()=>{
  const browser={};
  assert.equal(getInjectedWallet(browser),undefined);
  const calls=[];
  browser.okxwallet={request:async request=>{calls.push(request.method);return [account];}};
  assert.equal(await restoreWalletSession(getInjectedWallet(browser)),account);
  assert.deepEqual(calls,['eth_accounts']);
});

test('OKX-only provider supports authorization, signer, activity and HTTPS network switching',async()=>{
  const calls=[];let chain='0xb626';let authorized=false;
  const okxwallet={request:async request=>{
    calls.push(request.method);
    if(request.method==='eth_requestAccounts'){authorized=true;return [account];}
    if(request.method==='eth_accounts')return authorized?[account]:[];
    if(request.method==='eth_chainId')return chain;
    if(request.method==='wallet_switchEthereumChain'){chain=request.params[0].chainId;return null;}
    throw Error(`Unexpected wallet request: ${request.method}`);
  }};
  const provider=getInjectedWallet({okxwallet});
  assert.equal(await restoreWalletSession(provider),null);
  assert.deepEqual(await provider.request({method:'eth_requestAccounts'}),[account]);
  await ensureWalletNetwork(provider,getActiveNetworkConfig('robinhood'));
  const walletProvider=new BrowserProvider(provider);
  try{
    const signer=await walletProvider.getSigner();
    const connected=await signer.getAddress();
    assert.equal(connected.toLowerCase(),account);
    assert.deepEqual(activityRoles({demandId:1,demand:{creator:account,supplier:account},contribution:0n},[],connected),['created','supplied']);
    const destination=await prepareNetworkSelection({selected:'arbitrum',currentUrl:'https://demand-summons-supply.vercel.app/',ethereum:provider,connected:true});
    assert.equal(destination,'https://demand-summons-supply.vercel.app/?network=arbitrum#board');
    assert.equal(chain,'0x66eee');
    assert.equal(calls.filter(method=>method==='eth_requestAccounts').length,1);
  }finally{walletProvider.destroy();}
});
