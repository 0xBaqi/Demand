# Demand Market

**Demand summons supply.** Buyers put stable capital behind what they want before a supplier exists. Suppliers discover proven demand and respond. Unlike supply-first listings, the sequence is buyers → capitalized demand → supplier.

## Submission overview

Robinhood Chain Testnet is the default network; Arbitrum Sepolia is selectable in the same frontend. These are independent deployments with separate state and liquidity. The same contract address on both chains does not link them.

| Network | Chain ID | DemandMarket | Settlement USDG | Deployment block |
| --- | --- | --- | --- | --- |
| Robinhood Chain Testnet | 46630 | `0x527f508C47ac108Ae4d048F2B8f787E091bDb604` | `0x7E955252E15c84f5768B83c41a71F9eba181802F` | 128092099 |
| Arbitrum Sepolia | 421614 | `0x527f508C47ac108Ae4d048F2B8f787E091bDb604` | `0xFFC95faa3d63Cde504a05B567C600B78C0b41892` | 315158879 |

- [Robinhood contract](https://explorer.testnet.chain.robinhood.com/address/0x527f508C47ac108Ae4d048F2B8f787E091bDb604) · [official Paxos test USDG](https://explorer.testnet.chain.robinhood.com/token/0x7E955252E15c84f5768B83c41a71F9eba181802F)
- [Arbitrum contract](https://sepolia.arbiscan.io/address/0x527f508C47ac108Ae4d048F2B8f787E091bDb604) · [organizer-provided USDG](https://sepolia.arbiscan.io/token/0xFFC95faa3d63Cde504a05B567C600B78C0b41892)

Paxos test USDG is used for ERC-20 approval, escrowed backing, supplier settlement and exact-contribution refunds. Both configured tokens use six decimals. Testnet USDG is not real-money settlement. The creator has manually demonstrated the full Robinhood lifecycle with official test USDG, including payment to the supplier; do not infer an Arbitrum live settlement from that demonstration.

## Architecture

- `contracts/DemandMarket.sol`: one escrow contract per network; OpenZeppelin SafeERC20 and ReentrancyGuard; no backend or admin custody.
- `src/main.js`, `src/demand-card.js`: Vite/vanilla JavaScript interface, wallet-signed actions, buyer/supplier perspectives and human-readable lifecycle states. Contract `Funded` is presented as **Demand proven**.
- `src/network-config.js`, `src/network-selection.js`: canonical deployments and wallet network selection. Network changes reload the page to isolate pending reads and providers.
- `src/market-data.js`, `src/market-events.js`: direct RPC reads and deployment-bounded log indexing; up to 2,000 blocks per request, four parallel requests, chain-specific public-log caches and incremental overlap.
- `tests/`: contract, indexing, cards, wallet, activity and network-selection regressions. Final feature pass: 37 tests passed, including four contract tests.

The frontend presents a live demand board under “Demand summons supply.” It reads real demands without requiring a wallet. Create, back, offer, accept, report delivery, settle and refund use the existing wallet-signed contract actions. The public board shows the latest 20 demands with onchain lifecycle filters. My activity exposes created, backed, offered and supplied demands, including older demands discovered from wallet-matching events. Historical backing remains visible after refunds. Demand state renders before history loads. History uses deployment-bounded 2,000-block queries, four at a time, with optional local public-log caching and incremental refresh of a 12-block overlap. Chain state and balances are always reread. Funding time remaining comes from the latest chain snapshot and updates on Refresh. Authorized wallet addresses restore using eth_accounts, without requesting new access or signing on load. Arbitrum/network and explorer links are in the header menu. No fabricated demands, backer counts or supplier profiles are shown.

Frontend validation: `node --test tests/market-events.test.mjs tests/demand-card.test.mjs`. No frontend dependencies were added for the redesign.

Buyers pool USDG to prove demand for a product or service. Suppliers see funded opportunities, submit terms, fulfill an accepted offer, and receive escrow after the creator confirms delivery.

## Run

Node 20.19+ or 22.12+ is required.

```
npm install
npm test
npm run build
npm run dev
```

Compile generates the frontend ABI. The verified deployment addresses are already configured. Connect an Ethereum browser wallet, select Robinhood Chain Testnet or Arbitrum Sepolia, and use test ETH for gas. Approval and backing are separate wallet transactions. Use multiple wallets for creator, backer and supplier demo roles. No deployer key is needed to build, serve or browse the frontend.

Run the full suite with `node --test tests/*.test.mjs`. For a production preview use `npm run preview`. The deployment-ready frontend is only `dist/`; never upload the project root, `.env` files, wallet keys, `node_modules/`, or local work files. `demand-public-frontend.zip` contains only the production HTML, JavaScript and CSS, not repository source or secrets.

For this restricted Windows workspace, use `npm run build` then `npm run preview`: Vite development dependency scanning can encounter access-denied errors in parent folders, while the compiled preview works. If installation encounters certificate errors, use Node's `--use-system-ca` option with your trusted system certificate store; keep TLS verification enabled.

## Economic rules and Solidity lesson

`Open -> Funded -> Accepted -> Fulfilled -> Settled`. At the deadline, an Open or Funded demand can be refunded. The first refund stores Expired; expiry eligibility itself uses the timestamp, so no administrator or scheduled transaction is needed. At exactly the deadline, funding and acceptance fail and refunds succeed.

- `mapping(uint256 => mapping(address => uint256))` records each wallet's contribution for each demand. Repeated contributions accumulate.
- `totalCommitted` is historical funding and never exceeds `target`. Reaching the exact target immediately closes funding.
- `escrow` is outstanding money held for a demand. `totalEscrow` equals the sum of demand escrow balances. With a standard non-rebasing token, the contract balance is at least totalEscrow; unsolicited token transfers are not assigned to any demand.
- Refunds zero the caller's contribution before transfer, then reduce escrow by exactly that amount. A second refund fails. Settlement zeros escrow before paying only the selected supplier. Solidity reverts roll back all state changes if a token transfer fails.
- `storage` references edit the stored demand. `msg.sender` enforces creator and supplier permissions. Token amounts are integers in the token's smallest units; the frontend reads token decimals.
- OpenZeppelin SafeERC20 supports ERC20 return-value differences. ReentrancyGuard protects money-moving functions. Incoming balance checks reject fee-on-transfer behavior; deploy only with a verified standard USDG token.

Start learning with `backDemand`: follow its checks, contribution accounting, exact-target transition and token transfer. Then read `refund` and explain why the contribution is set to zero before sending money.

## Trust and scope

The creator accepts a supplier and confirms fulfillment. Suppliers receive the full funded target. There are no fees or administrator withdrawal paths. Accepted demands cannot expire into refunds: if the supplier never fulfills or the creator never settles, escrow remains locked. This is an explicit MVP limitation, not a production dispute-resolution system. Supplier offer terms are editable until acceptance, then frozen. Offchain fulfillment is a human assertion, not cryptographic proof. Contract metadata and offer terms are public. Keep sensitive details offchain.

## Arbitrum Sepolia deployment

Network: chain 421614, RPC https://sepolia-rollup.arbitrum.io/rpc, documented at https://docs.arbitrum.io/arbitrum-bridge/quickstart .

Set environment variables locally: `DEPLOYER_PRIVATE_KEY` (a funded testnet-only wallet) and `USDG_ADDRESS` (the organizer's verified testnet token), then run `npm run deploy`. Never share the key in chat. The script checks network, token code, symbol and decimals and records `deployment.json`. Symbol checking is not proof of token authenticity: independently verify the address.

The user supplied `0xFFC95faa3d63Cde504a05B567C600B78C0b41892` as the organizer token. RPC checks on Arbitrum Sepolia confirmed deployed code, symbol USDG and 6 decimals. This is the deployment script default; these checks do not independently establish issuer authenticity. For an explicitly labeled test demo only, omit USDG_ADDRESS and set `DEPLOY_DEMO_TOKEN=true`; the script deploys MockUSDG, minting its supply to the deployer. Transfer some to backers using a wallet before the demo. A mock token must not be presented as genuine USDG integration. Deployment writes `.env.local` for the frontend; rebuild afterward.

## Judge demo

1. Explain the real problem: a community wants laundry pickup, but a supplier cannot see committed demand.
2. Create a 100 USDG demand with a future deadline.
3. Contribute 23 and 77 USDG from separate wallets. Show that an over-target contribution fails and exact funding closes commitments.
4. Supplier submits delivery terms; creator selects that supplier.
5. Supplier marks delivery complete; creator confirms and pays the supplier.
6. On a second demand, choose a short deadline, contribute, wait for expiry, and claim the exact amount back.

Judging story: contract quality comes from clear accounting and executable tests; product fit from pooled local demand; creativity from reversing supplier-led listings; real problem solving from visible paid commitment; meaningful USDG use from escrow, supplier payment and exact refunds. Both testnet deployments are verified; the Robinhood lifecycle has been manually demonstrated with official Paxos test USDG.

The public board shows only the latest 20 demands. Wallet activity can discover older matching demands. No fabricated backer counts, profiles or offchain fulfillment proof are shown. Public RPC availability can delay loading. Wallet approvals are permissions, not proof of backing; a settled contract state and settlement transaction are the payment evidence.
