# Frontend Handoff

Live defaults are already in `src/lib`.

| Item | Value |
| --- | --- |
| Chain | Arc testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| USDC | `0x3600000000000000000000000000000000000000` |
| Pool | `0xAe632832f9a588DeCe304B1f1cCb946B3cEd79e1` |

Use:

- `src/lib/arcChain.ts` for viem/Dynamic chain config.
- `src/lib/addresses.ts` for contract addresses.
- `src/lib/abi.ts` for the pool ABI.

Required frontend env:

- `VITE_DYNAMIC_ENVIRONMENT_ID` enables Dynamic wallet connect and all write flows.
- `VITE_API_BASE_URL` points the underwriting panel at the backend and defaults to `http://127.0.0.1:8788`.
- `VITE_STAKE_AND_ADVANCE_ADDRESS` overrides the default pool contract address.

If `VITE_DYNAMIC_ENVIRONMENT_ID` is unset, the app intentionally falls back to read-only mode instead of booting with a broken wallet configuration.

The pool is single-company. The frontend reads `company()` from the pool and uses that address for underwriting; only that wallet can draw down or repay.

## User Flow

Member:

1. `USDC.approve(pool, amount)`
2. `pool.deposit(amount)`
3. read `sharesOf(user)`, `navPerShare1e18()`, `previewRedeem(shares)`
4. `pool.redeem(shares)`

Company:

1. backend calls `/cre/underwrite`
2. company reads `availableToBorrow()`
3. company calls `drawdown(amount)`
4. company repays with `repay(amount)`

Anyone:

1. read `dueAt()` and `defaultGracePeriod()`
2. call `markDefaulted()` when overdue

## Backend Reads

Run `npm run server`, then call:

```bash
curl localhost:8788/health
curl localhost:8788/pool/state
```

Run underwriting:

```bash
curl -X POST localhost:8788/cre/underwrite \
  -H 'content-type: application/json' \
  -d '{"vendor":"0x19E95b026731974B7c1feD9eb3c3113fBDD80464","currentDepositedPrincipalUsdc":250,"monthlyRecurringRevenueUsd":5000,"grossMarginBps":8000,"cashBalanceUsd":50000,"monthlyBurnUsd":20000,"delinquencyRateBps":100}'
```

Recommended first screen: one pool dashboard with NAV, APR, cash, outstanding debt, available borrow,
deposit/redeem actions, and the connected user's share position.
