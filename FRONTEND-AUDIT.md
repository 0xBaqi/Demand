# Frontend behavior audit — October 3, 2026

## Loading measurements

Live public-RPC measurements of the frontend's data-loading sequence, not browser paint timings. One run per phase; latency varies. Full request records: work/loading-before.json and work/loading-after.json. Run the after harness with `node --use-system-ca work/audit-after.mjs` on this machine; certificate verification remains enabled.

| Phase | Before | After | Historical log requests before / after |
| --- | ---: | ---: | ---: |
| Initial public board | 20,479 ms | 2,127 ms | 62 / 0 |
| Public board Refresh | 21,504 ms | 809 ms | 62 / 0 |
| First complete activity/history scan | — | 5,004 ms | — / 64 |
| Persisted-cache history refresh | — | 580 ms | — / 1 |

The original board waited for all supplier-offer chunks before reading/rendering demand state, even though the one open demand had no supplier offers. Initial scanning alone took 18,367 ms; Refresh scanning took 20,306 ms. Each run unnecessarily rescanned the deployment-to-head range sequentially. The head advanced between measurements, explaining 62 versus 64 chunks.

Initial data now requires four eth_call requests (token, decimals, count, demand), one block-number request and one block-header request. Refresh requires two eth_call requests and the two block requests. A connected wallet adds a contribution read per card and an initial read-only eth_accounts request. Fixed-network read configuration removes repeated chain-ID probes (previously 66 initial / 64 Refresh).

History is deferred for an open-only public board. Other lifecycle states and My activity fetch history after cards render. All market events are fetched together instead of separate event-type scans. Queries never precede deployment block 315158879 and never exceed 2,000 inclusive blocks. Four requests run concurrently with deterministic result ordering. Public logs only are cached under a network/contract/deployment-specific local-storage key; fresh state is not cached. Each later scan rereads a 12-block tail and replaces it, covering shallow reorgs. Failed scans do not advance the cache watermark. Deep reorgs beyond that overlap and corrupt browser storage are not a full production indexing solution.

## Navigation

Explore was a redundant anchor to the same board, not another product view. It is now explicitly named Demand board, with real lifecycle filters: all demand, gathering demand, ready for supply, delivered and paid. Filters and switching back to the board use loaded state and do not issue RPC requests. No categories are invented.

## My activity

Created demands match the current wallet against the onchain creator. Backed activity derives from current contributions or Backed logs, offered activity from Offered logs, and supplied activity from selected supplier/Accepted logs. Created, Backed, Offered and Supplied tabs and counts describe demands, not numbers of transactions. A matching historical event discovers older demand IDs outside the public latest-20 window and their states are fetched. Creator cards render without waiting for history; initial complete history still takes several seconds. Errors are visible rather than silently asserting complete history.

## Wallet restoration

Previously approved access is wallet-managed permission restoration, not a new authorization or a signature. Page load now explicitly reads eth_accounts only. No accounts means Connect wallet; explicit connection is the only access request. Account changes refresh wallet-specific data without reloading the page, and chain changes invalidate the signer while leaving read-only data on Sepolia. Signing and switching to Sepolia remain user-initiated. Unauthorized, authorized and missing-provider cases are regression-tested; the in-app read-only browser also displays Connect wallet and the real laundry demand. An actual fresh MetaMask profile and its permission dialogs still need manual verification.

## Validation and boundaries

All four contract tests, four original query regressions, five card/UI tests and seven new frontend regressions pass. The production build succeeds. No Solidity changes or deployments; configured market and USDG addresses are unchanged. Live USDG contributions and settlement remain pending faucet availability. Public board pagination beyond the latest 20 and production-grade deep-reorg recovery remain out of scope. The restarted production preview is at http://127.0.0.1:5174/ because port 5173 is already occupied; the existing listener was left untouched.

Manual checks: reload and Refresh the board; verify the UNILAG demand remains visible; switch lifecycle filters and back to All; with the creator wallet, open My activity → Created; confirm the laundry card and one created-demand count. Test an unauthorized wallet profile for Connect wallet without unsolicited access prompts. No USDG is needed for these checks.
