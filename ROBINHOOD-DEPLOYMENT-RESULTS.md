# Robinhood Chain Testnet — verified additive deployment

## Public submission evidence

- Network: Robinhood Chain Testnet, chain ID 46630.
- RPC: https://rpc.testnet.chain.robinhood.com
- DemandMarket: 0x527f508C47ac108Ae4d048F2B8f787E091bDb604
- Deployment transaction: 0x529ef31d85d5ff2888766aa47255bf4ca8e308e0703a3aaeed0aaf91c680d649
- Deployment block: 128092099.
- Deployer: 0xa11c20b7f5525468b0FACAF6fe246C31F5eB912c
- Official Paxos test USDG: 0x7E955252E15c84f5768B83c41a71F9eba181802F, 6 decimals.
- Receipt status: 1.
- Exact creation bytecode plus constructor argument: matches.
- Exact runtime bytecode with the constructor token substituted into immutable references: matches.
- Onchain token() configuration: matches official Robinhood Testnet USDG.
- Runtime code hash: 0x4c5d5e3b09b1eed3820d9dc2b742355d6c71843e3bf68d609c90f749d881edc6
- Public deployment/verification record: deployment-robinhood.json.

[Contract](https://explorer.testnet.chain.robinhood.com/address/0x527f508C47ac108Ae4d048F2B8f787E091bDb604) · [Deployment transaction](https://explorer.testnet.chain.robinhood.com/tx/0x529ef31d85d5ff2888766aa47255bf4ca8e308e0703a3aaeed0aaf91c680d649)

The market's hexadecimal address is the same as on Arbitrum Sepolia, but these are separate contracts on separate chains with different settlement tokens, balances and demand state. No cross-chain messaging or shared liquidity exists.

## Preservation checks

SHA-256 hashes of contracts/DemandMarket.sol, artifacts/DemandMarket.json, deployment.json, deployment-verification.json and .env.local match their pre-Robinhood values. The existing Arbitrum deployment was not replaced or redeployed. No private key was requested in chat or saved by the deployment tooling. The user's own masked local signing workflow submitted the transaction.

Live RPC reads confirm Arbitrum chain 421614 still contains demand #1, “24-hour laundry pickup for UNILAG,” using its original USDG address. Robinhood chain 46630 currently has zero demands. The preview's empty board reflects that real state, not an indexing failure.

## Isolated frontend

- Configuration: .env.robinhood.local and src/network-config.js.
- Production output: dist-robinhood; the working Arbitrum dist folder was left untouched.
- Preview: http://127.0.0.1:5175/
- Query lower bound: Robinhood deployment block 128092099, not Arbitrum block 315158879.
- Cache namespace: demandmarket:46630:0x527f508c47ac108ae4d048f2b8f787e091bdb604:128092099:events-v1.
- Existing 2,000-block inclusive ranges, four-query parallelism, public-log caching and 12-block incremental overlap are preserved.
- RPC, explorer links, token checks, wallet network requests, header and notices use the Robinhood configuration.
- Arbitrum remains the default build configuration; no in-app cross-chain switch was introduced.

Commands from the project directory:

```powershell
npm run build:robinhood
npm run preview:robinhood
```

The Robinhood build requires a successful separate deployment record and rejects mismatches in chain, market, token or deployment block. To repeat public verification without providing a key:

```powershell
.\scripts\run-robinhood-local.ps1 -Mode verify
```

## Validation and remaining work

All four contract tests and 24 frontend/query/card/network regression tests pass. Both production configurations build successfully. Arbitrum's production validation output was directed to dist-arbitrum-check so the working dist/ preview was not overwritten. A live Robinhood log scan from its deployment block succeeded. Browser inspection confirms Robinhood Chain Testnet, chain 46630, official Paxos test USDG, Connect wallet and an onchain empty board.

Manual wallet test: open the Robinhood preview in a wallet-enabled browser, connect and approve the Robinhood network request, create a demand with a future deadline, then Refresh and fully reload to confirm it persists. Creating a demand requires Robinhood test ETH, not USDG. Verify the wallet displays chain 46630 before signing. Do not paste keys into chat.

No Robinhood demand creation or live USDG contribution/fulfillment/settlement was performed in this deployment task. Those transactions remain pending; deployment success is not proof of a completed financial flow. In particular, obtaining official test USDG remains a separate requirement.
