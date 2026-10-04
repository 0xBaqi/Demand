import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
export function compile() {
  const sources = Object.fromEntries(['DemandMarket', 'MockUSDG'].map(name => [`contracts/${name}.sol`, {content: fs.readFileSync(`contracts/${name}.sol`, 'utf8')}]));
  const output = JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}}), {import: filename => {
    try { return {contents:fs.readFileSync(path.join('node_modules', filename),'utf8')}; } catch { return {error:`Missing ${filename}`}; }
  }}));
  const errors = (output.errors || []).filter(error => error.severity === 'error');
  if (errors.length) throw new Error(errors.map(error => error.formattedMessage).join('\n'));
  fs.mkdirSync('artifacts',{recursive:true});
  for (const name of ['DemandMarket','MockUSDG']) {
    const contract = output.contracts[`contracts/${name}.sol`][name];
    fs.writeFileSync(`artifacts/${name}.json`,JSON.stringify({abi:contract.abi,bytecode:`0x${contract.evm.bytecode.object}`,deployedBytecode:`0x${contract.evm.deployedBytecode.object}`,immutableReferences:contract.evm.deployedBytecode.immutableReferences},null,2));
  }
  fs.mkdirSync('src',{recursive:true});
  fs.writeFileSync('src/abi.json',JSON.stringify(output.contracts['contracts/DemandMarket.sol'].DemandMarket.abi));
}
if (process.argv[1]?.endsWith('compile.mjs')) {compile(); console.log('Contracts compiled.');}
