import fs from 'node:fs';
import {JsonRpcProvider, Wallet, ContractFactory, Contract, isAddress} from 'ethers';
import {compile} from './compile.mjs';
import {verifyDeployment} from './verify-deployment.mjs';
compile();
if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error('Set DEPLOYER_PRIVATE_KEY locally. Never paste it into chat.');
const provider = new JsonRpcProvider(process.env.ARBITRUM_RPC || 'https://sepolia-rollup.arbitrum.io/rpc');
try {
if ((await provider.getNetwork()).chainId !== 421614n) throw new Error('Deployment requires Arbitrum Sepolia.');
const signer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
if (process.env.EXPECTED_DEPLOYER_ADDRESS && signer.address.toLowerCase() !== process.env.EXPECTED_DEPLOYER_ADDRESS.toLowerCase()) throw new Error('Entered key does not match the expected public deployer address.');
if (fs.existsSync('deployment.json')) {
  const existing = JSON.parse(fs.readFileSync('deployment.json','utf8'));
  await verifyDeployment(provider,existing);
  console.log('Existing deployment verified; no duplicate contract deployed.');
  fs.writeFileSync('.env.local',`VITE_MARKET_ADDRESS=${existing.market}\nVITE_DEMO_TOKEN=${existing.demoToken}\n`);
} else {
let tokenAddress = process.env.USDG_ADDRESS || (process.env.DEPLOY_DEMO_TOKEN === 'true' ? undefined : '0xFFC95faa3d63Cde504a05B567C600B78C0b41892');
let demoToken = false;
if (!tokenAddress) {
  if (process.env.DEPLOY_DEMO_TOKEN !== 'true') throw new Error('Set a verified USDG_ADDRESS, or explicitly set DEPLOY_DEMO_TOKEN=true for a mock demo.');
  const artifact = JSON.parse(fs.readFileSync('artifacts/MockUSDG.json'));
  const mock = await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy();
  await mock.waitForDeployment(); tokenAddress = await mock.getAddress(); demoToken = true;
}
if (!isAddress(tokenAddress) || await provider.getCode(tokenAddress) === '0x') throw new Error('Invalid USDG contract');
const token = new Contract(tokenAddress,['function decimals() view returns(uint8)','function symbol() view returns(string)'],provider);
const decimals = Number(await token.decimals());
if (await token.symbol() !== 'USDG') throw new Error('Token symbol is not USDG; verify organizer token address.');
const artifact = JSON.parse(fs.readFileSync('artifacts/DemandMarket.json'));
const factory = new ContractFactory(artifact.abi,artifact.bytecode,signer);
const request = await factory.getDeployTransaction(tokenAddress);
const gas = await provider.estimateGas({...request,from:signer.address});
const fees = await provider.getFeeData();
const gasPrice = fees.maxFeePerGas || fees.gasPrice;
if (!gasPrice) throw new Error('Cannot estimate gas price');
const balance = await provider.getBalance(signer.address);
console.log(`Public deployer: ${signer.address}; estimated gas: ${gas}`);
if (balance < gas * gasPrice * 120n / 100n) throw new Error('Fund the public deployer with Arbitrum Sepolia ETH before deployment.');
const market = await factory.deploy(tokenAddress);
const address = await market.getAddress();
fs.writeFileSync('deployment.json',JSON.stringify({chainId:421614,market:address,token:tokenAddress,decimals,demoToken,transaction:market.deploymentTransaction().hash},null,2));
console.log(`Deployment submitted: https://sepolia.arbiscan.io/tx/${market.deploymentTransaction().hash}`);
await market.waitForDeployment();
await verifyDeployment(provider,JSON.parse(fs.readFileSync('deployment.json','utf8')));
fs.writeFileSync('.env.local',`VITE_MARKET_ADDRESS=${address}\nVITE_DEMO_TOKEN=${demoToken}\n`);
console.log(`Deployed ${address}; saved deployment.json and frontend configuration.`);
}
} finally {provider.destroy();}
