import fs from 'node:fs';
import assert from 'node:assert/strict';
import {AbiCoder,Contract,ContractFactory,JsonRpcProvider,Wallet,keccak256} from 'ethers';

const chainId=46630;
const rpc='https://rpc.testnet.chain.robinhood.com';
const tokenAddress='0x7E955252E15c84f5768B83c41a71F9eba181802F';
const deployerAddress='0xa11c20b7f5525468b0facaf6fe246c31f5eb912c';
const explorer='https://explorer.testnet.chain.robinhood.com';
const recordPath='deployment-robinhood.json';
const artifact=JSON.parse(fs.readFileSync('artifacts/DemandMarket.json','utf8'));
const provider=new JsonRpcProvider(rpc,chainId,{staticNetwork:true});
let stage='network verification';

async function verify(deployment){
  stage='deployment verification';
  assert.equal(deployment.chainId,chainId,'Record has wrong chain');
  assert.equal(deployment.token.toLowerCase(),tokenAddress.toLowerCase(),'Record has wrong token');
  const receipt=await provider.waitForTransaction(deployment.transaction,1,180000);
  assert.ok(receipt,'Receipt not available; rerun verify without redeploying');
  assert.equal(receipt.status,1,'Deployment receipt status is not 1');
  assert.equal(receipt.contractAddress?.toLowerCase(),deployment.market.toLowerCase(),'Receipt contract address mismatch');
  const transaction=await provider.getTransaction(deployment.transaction);
  assert.ok(transaction,'Deployment transaction unavailable');
  assert.equal(transaction.to,null,'Transaction is not contract creation');
  assert.equal(transaction.from.toLowerCase(),deployerAddress.toLowerCase(),'Unexpected deployer');
  assert.equal(transaction.chainId,BigInt(chainId),'Transaction has wrong chain ID');
  const tokenWord=AbiCoder.defaultAbiCoder().encode(['address'],[tokenAddress]).slice(2);
  assert.equal(transaction.data.toLowerCase(),(artifact.bytecode+tokenWord).toLowerCase(),'Creation bytecode/constructor mismatch');
  const groups=Object.values(artifact.immutableReferences);
  assert.equal(groups.length,1,'Expected only one immutable token');
  let runtime=artifact.deployedBytecode.slice(2);
  for(const reference of groups[0]){
    assert.equal(reference.length,32,'Unexpected immutable size');
    const start=reference.start*2;
    runtime=runtime.slice(0,start)+tokenWord+runtime.slice(start+64);
  }
  const deployedCode=await provider.getCode(deployment.market);
  assert.equal(deployedCode.toLowerCase(),`0x${runtime}`.toLowerCase(),'Runtime bytecode mismatch');
  const market=new Contract(deployment.market,artifact.abi,provider);
  assert.equal((await market.token()).toLowerCase(),tokenAddress.toLowerCase(),'Onchain token mismatch');
  const token=new Contract(tokenAddress,['function decimals() view returns(uint8)','function symbol() view returns(string)'],provider);
  assert.equal(await token.decimals(),6n,'Wrong USDG decimals');
  assert.equal(await token.symbol(),'USDG','Wrong USDG symbol');
  const verified={...deployment,deployer:transaction.from,blockNumber:receipt.blockNumber,status:receipt.status,decimals:6,creationBytecodeMatches:true,runtimeBytecodeMatches:true,constructorTokenMatches:true,runtimeCodeHash:keccak256(deployedCode),verified:true,checkedAt:new Date().toISOString(),contractUrl:`${explorer}/address/${deployment.market}`,transactionUrl:`${explorer}/tx/${deployment.transaction}`,realUSDGCommitSettlementTest:'pending'};
  fs.writeFileSync(recordPath,JSON.stringify(verified,null,2));
  fs.writeFileSync('.env.robinhood.local',`VITE_NETWORK=robinhood\nVITE_ROBINHOOD_MARKET_ADDRESS=${verified.market}\nVITE_ROBINHOOD_DEPLOYMENT_BLOCK=${verified.blockNumber}\n`);
  console.log(JSON.stringify(verified,null,2));
}

try{
  assert.equal(BigInt(await provider.send('eth_chainId',[])),BigInt(chainId),'RPC is not Robinhood Testnet');
  if(fs.existsSync(recordPath)){
    console.log('Existing Robinhood submission found; verifying without sending another deployment.');
    await verify(JSON.parse(fs.readFileSync(recordPath,'utf8')));
  }else{
    assert.notEqual(process.argv[2],'verify','No Robinhood deployment record exists');
    stage='local signer preparation';
    if(!process.env.DEPLOYER_PRIVATE_KEY)throw new Error('Local signing not configured');
    const signer=new Wallet(process.env.DEPLOYER_PRIVATE_KEY,provider);
    assert.equal(signer.address.toLowerCase(),deployerAddress.toLowerCase(),'Key does not match expected public deployer');
    delete process.env.DEPLOYER_PRIVATE_KEY;
    stage='deployment preflight';
    assert.notEqual(await provider.getCode(tokenAddress),'0x','Official USDG has no code');
    const factory=new ContractFactory(artifact.abi,artifact.bytecode,signer);
    const request=await factory.getDeployTransaction(tokenAddress);
    const gas=await provider.estimateGas({...request,from:signer.address});
    const fees=await provider.getFeeData();
    const price=fees.maxFeePerGas||fees.gasPrice;
    assert.ok(price,'Fee estimate unavailable');
    assert.ok(await provider.getBalance(signer.address)>=gas*price*120n/100n,'Insufficient Robinhood ETH');
    stage='deployment submission';
    const market=await factory.deploy(tokenAddress);
    const deployment={chainId,rpc,market:await market.getAddress(),transaction:market.deploymentTransaction().hash,deployer:signer.address,token:tokenAddress,verified:false,submittedAt:new Date().toISOString()};
    fs.writeFileSync(recordPath,JSON.stringify(deployment,null,2));
    console.log(`Submitted public transaction: ${explorer}/tx/${deployment.transaction}`);
    await verify(deployment);
  }
}catch(error){
  console.error(`STOPPED during ${stage}. ${error.code==='ERR_ASSERTION'?error.message:'Operation failed; inspect the public transaction record or retry verification. No key details are logged.'}`);
  process.exitCode=1;
}finally{delete process.env.DEPLOYER_PRIVATE_KEY;provider.destroy();}
