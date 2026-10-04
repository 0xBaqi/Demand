import fs from 'node:fs';
import assert from 'node:assert/strict';
import {build,loadEnv} from 'vite';
import {getNetworkConfig} from '../src/network-config.js';

const deployment=JSON.parse(fs.readFileSync('deployment-robinhood.json','utf8'));
const network=getNetworkConfig(loadEnv('robinhood',process.cwd(),'VITE_'));
assert.equal(deployment.verified,true,'Verify Robinhood deployment before building');
assert.equal(deployment.status,1,'Robinhood deployment failed');
assert.equal(deployment.runtimeBytecodeMatches,true,'Runtime verification required');
assert.equal(deployment.creationBytecodeMatches,true,'Creation verification required');
assert.equal(deployment.constructorTokenMatches,true,'Token verification required');
assert.equal(network.chainId,46630,'Wrong preview chain');
assert.equal(deployment.chainId,network.chainId,'Record chain mismatch');
assert.equal(deployment.market.toLowerCase(),network.market.toLowerCase(),'Preview market mismatch');
assert.equal(deployment.token.toLowerCase(),network.token.toLowerCase(),'Preview token mismatch');
assert.equal(deployment.blockNumber,network.deploymentBlock,'Preview deployment block mismatch');
await build({mode:'robinhood',build:{outDir:'dist-robinhood'}});
