# Deployment and real testnet run

No contract changes are required. No transaction has been sent yet.

Public deployer: `0xa11c20b7f5525468b0facaf6fe246c31f5eb912c`.

Read-only RPC checks on October 3, 2026 found 0 Arbitrum Sepolia ETH and 0 USDG in this wallet.

## Fund the wallets

1. Select Arbitrum Sepolia in your wallet: chain 421614, RPC `https://sepolia-rollup.arbitrum.io/rpc`, explorer `https://sepolia.arbiscan.io`. See https://docs.arbitrum.io/arbitrum-bridge/quickstart .
2. Visit https://www.alchemy.com/faucets/arbitrum-sepolia . Enter only your public deployer address and use Send. The published faucet currently offers 0.1 test ETH per 24 hours, subject to eligibility, including mainnet balance/activity requirements. If ineligible, ask the hackathon organizers for Arbitrum Sepolia ETH to this public address. Do not buy mainnet funds solely to qualify.
3. Use a separate supplier wallet on the same testnet, and give it test ETH too. It needs gas for two transactions, offer and fulfillment. It does not need USDG initially.
4. Paxos documents https://faucet.paxos.com/ as its test stablecoin faucet. Choose Arbitrum Sepolia and USDG if offered, enter the public deployer address, and complete the site's claim requirements. This faucet's live form could not be inspected from this session (403), so its exact controls and availability are unverified. If Arbitrum USDG is unavailable there, request at least 1 test USDG directly from organizers, specifying token `0xFFC95faa3d63Cde504a05B567C600B78C0b41892`, network Arbitrum Sepolia and the public recipient above. Do not substitute USDC, a mock token or a different network.
5. Import this USDG contract into your wallet on Arbitrum Sepolia, symbol USDG and decimals 6. Paxos's official token list confirms the address: https://docs.paxos.com/guides/stablecoin/usdg/testnet . Verify your received balance with the explorer or the read-only RPC checks.

Never enter a seed phrase or private key on a faucet. Native test ETH pays gas; USDG is committed to the market. Requesting USDG for this wallet does not require a Paxos custodial deposit address.

## Local deployment

Open PowerShell on your own computer in this project folder, then run:

```
.\scripts\run-local.ps1 -Mode deploy
```

The masked prompt accepts a testnet wallet private key locally; it is passed only to the child process and cleared from the parent environment afterward. Nothing writes it to a file or displays it. The script checks that the entered key corresponds to the public deployer above. Do not paste it in chat, tool arguments or command history. Wallets with hardware-only signing cannot use this key-based helper; use a wallet transaction signing route instead.

The deployment script uses the organizer USDG address, estimates gas, saves the submitted public transaction before waiting, and checks the successful receipt, created address, deployed code, token constructor and exact creation bytecode. `deployment-verification.json` records those checks. This is onchain deployment verification, not explorer source-code publication.

## Real end-to-end test

Once deployed and funded with at least 1 USDG, run locally:

```
.\scripts\run-local.ps1 -Mode e2e
```

Enter the deployer key and a different supplier key at the two masked local prompts. The creator and backer use the deployer wallet. The separate supplier receives settlement. The run creates a 1 USDG demand, approves USDG, backs it with 0.4 and 0.6 USDG, submits an offer, accepts the supplier, marks fulfilled as supplier, then confirms delivery and settles as creator.

The script saves transaction hashes immediately to `submission-transactions.json`, resumes already submitted steps without repeating them, verifies every receipt, checks the settled state and zero demand escrow, and checks the exact 1 USDG Transfer event plus supplier balance increase. A successful run creates `HACKATHON-SUBMISSION.md` with all public links. Do not claim completion until these checks pass.

Share only the public deployment address/transaction or let Codex read these generated public files. Codex can independently rerun `.\scripts\run-local.ps1 -Mode verify` without any key.
