import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JsonRpcProvider,Contract,AbiCoder} from 'ethers';

export async function verifyDeployment(provider, deployment) {
  assert.equal((await provider.getNetwork()).chainId,421614n,'Wrong network');
  const receipt=await provider.getTransactionReceipt(deployment.transaction);
  assert.ok(receipt,'Deployment is not mined yet');
  assert.equal(receipt.status,1,'Deployment reverted');
  assert.equal(receipt.contractAddress?.toLowerCase(),deployment.market.toLowerCase(),'Receipt address mismatch');
  const deployedCode=await provider.getCode(deployment.market);
  assert.notEqual(deployedCode,'0x','No deployed code');
  const artifact=JSON.parse(fs.readFileSync('artifacts/DemandMarket.json','utf8'));
  const transaction=await provider.getTransaction(deployment.transaction);
  const expected=artifact.bytecode+AbiCoder.defaultAbiCoder().encode(['address'],[deployment.token]).slice(2);
  assert.equal(transaction.data.toLowerCase(),expected.toLowerCase(),'Deployment input does not match compiled contract and USDG constructor');
  assert.ok(artifact.deployedBytecode,'Recompile to export expected runtime bytecode');
  let expectedRuntime=artifact.deployedBytecode.slice(2);
  const tokenWord=AbiCoder.defaultAbiCoder().encode(['address'],[deployment.token]).slice(2);
  const immutableGroups=Object.values(artifact.immutableReferences);
  assert.equal(immutableGroups.length,1,'Expected only the immutable token address');
  for(const reference of immutableGroups[0]) {
    assert.equal(reference.length,32,'Unexpected immutable length');
    const start=reference.start*2;
    expectedRuntime=expectedRuntime.slice(0,start)+tokenWord+expectedRuntime.slice(start+64);
  }
  assert.equal(deployedCode.toLowerCase(),`0x${expectedRuntime}`.toLowerCase(),'Deployed runtime bytecode mismatch');
  const market=new Contract(deployment.market,artifact.abi,provider);
  assert.equal((await market.token()).toLowerCase(),deployment.token.toLowerCase(),'Wrong escrow token');
  const verified={chainId:421614,market:deployment.market,token:deployment.token,deployer:transaction.from,transaction:deployment.transaction,blockNumber:receipt.blockNumber,status:receipt.status,creationBytecodeMatches:true,runtimeBytecodeMatches:true,constructorTokenMatches:true,realUSDGCommitSettlementTest:'pending: Paxos faucet inaccessible; deployer holds zero USDG',contractUrl:`https://sepolia.arbiscan.io/address/${deployment.market}`,transactionUrl:`https://sepolia.arbiscan.io/tx/${deployment.transaction}`,checkedAt:new Date().toISOString()};
  fs.writeFileSync('deployment-verification.json',JSON.stringify(verified,null,2));
  console.log(JSON.stringify(verified,null,2));
  return verified;
}
if (process.argv[1]?.endsWith('verify-deployment.mjs')) {
  const provider=new JsonRpcProvider(process.env.ARBITRUM_RPC || 'https://sepolia-rollup.arbitrum.io/rpc');
  try {await verifyDeployment(provider,JSON.parse(fs.readFileSync('deployment.json','utf8')));} finally {provider.destroy();}
}
