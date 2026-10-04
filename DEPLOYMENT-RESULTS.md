# Verified deployment — Arbitrum Sepolia

- Network: Arbitrum Sepolia, chain ID 421614.
- DemandMarket: `0x527f508C47ac108Ae4d048F2B8f787E091bDb604`.
- Deployment transaction: `0x0ae7a6bdb7a00fccb447b88dd16272a9ce70ce730f1ad154014b182fc6db7041`.
- Deployment block: 315158879.
- Deployer: `0xa11c20b7f5525468b0FACAF6fe246C31F5eB912c`.
- Organizer USDG: `0xFFC95faa3d63Cde504a05B567C600B78C0b41892`, decimals 6.
- Receipt status: 1 (success).
- Creation bytecode plus constructor matches the compiled artifact.
- Runtime bytecode matches the compiled artifact with the immutable token address filled in.
- `token()` matches the organizer USDG address.
- Solidity source unchanged; SHA256 `0CB0E2B7E041A11F5000EBDF1419452947CAE3911CD2E2459D9B1BE9D30E8CA8`.
- Production build passed; all 4 existing contract tests passed again after deployment.
- `.env.local`, the production bundle and the visible Contract address input all contain the deployed address.
- Local preview responds HTTP 200 at http://127.0.0.1:5173/ . Use a browser with an Ethereum wallet extension for wallet tests.

Contract: https://sepolia.arbiscan.io/address/0x527f508C47ac108Ae4d048F2B8f787E091bDb604

Deployment: https://sepolia.arbiscan.io/tx/0x0ae7a6bdb7a00fccb447b88dd16272a9ce70ce730f1ad154014b182fc6db7041

Detailed independent RPC verification: `deployment-verification.json`. This does not claim explorer source-code publication.

## Manual UI checks without USDG

1. Open the local URL in a wallet-enabled browser. Expand Marketplace connection and confirm the address above.
2. Connect the deployer wallet and select Arbitrum Sepolia. This uses account permissions, not a token transfer. The wallet label should show the selected address.
3. With no existing demands, Refresh should display the empty marketplace. At inspection, live demandCount and totalEscrow were both zero.
4. Optionally create one demand named `UNILAG laundry — deployment smoke test`, target 1 USDG, and a deadline at least 30 minutes in the future. This requires only test ETH. Confirm the create transaction in your own wallet and record its public transaction hash.
5. Check the transaction on Arbiscan for success and the Created event. Demand metadata, target 1000000 smallest units, creator and deadline should match. No tokens move on creation.
6. After confirmation, the demand card should appear automatically. Click Refresh and reload/reconnect to verify that the same demand is still displayed. The frontend now starts supplier-log queries at deployment block 315158879 in inclusive 2000-block chunks; it never scans block zero. If supplier logs are unavailable, cards still render and a warning is shown. Transaction status includes an Arbiscan link and distinguishes confirmation from a failed refresh.
7. Rejecting a create transaction should return control with an error message and re-enable buttons. Empty/zero target fields should be rejected by browser validation. A past deadline should be rejected by the contract before sending a successful transaction.

## Material demo issues — reported, not fixed

1. Fixed frontend blocker: offer logs now use deployment block 315158879 and contiguous inclusive chunks of at most 2000 blocks. One offer scan serves all displayed cards. State reads use a single block snapshot, at least the confirmed transaction's block. Offer-query failures no longer hide demand cards. The helper passed a live RPC query through block 315162789, and four regression tests cover chunk boundaries, deployment-only queries, predeployment avoidance and error propagation. All four contract tests and the production build pass.
2. The app requires an injected Ethereum wallet; there is no public read-only browsing mode or WalletConnect flow. Use a browser with an installed wallet extension. The automated Connect wallet click was blocked by automatic review because it could request wallet account access; wallet connection and creation remain manual UI tests, not verified live interactions.
3. The connection code switches to Arbitrum Sepolia but does not add the network if it is absent. Add chain 421614 to the wallet before the demo.
4. Transaction messages now retain an Arbiscan transaction link once submitted and explicitly distinguish a confirmed transaction from a refresh failure. Wallet activity remains available as an independent check.
5. Supplier acceptance requires copying a full wallet address into a field; a wrong address produces a failed acceptance. Prepare the correct supplier address for the live demo.
6. Accepted escrow has no nonfulfillment timeout or dispute refund; creator confirmation is trusted. This is the existing economic design and was not changed.

## Pending real-token test

Paxos faucet is inaccessible (403) and the deployer has zero USDG. Live USDG approval/backing, target-reached transition, supplier acceptance/fulfillment and supplier settlement have NOT been executed. These paths pass local contract tests only. The prepared real-testnet runner and public transaction recorder remain available for when the organizer token is obtained. No new product features or UI redesign were added.
