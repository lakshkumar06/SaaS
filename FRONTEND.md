# Frontend Handoff

Live defaults are already in `app/lib`.

| Item | Value |
| --- | --- |
| Chain | Arc testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| USDC | `0x3600000000000000000000000000000000000000` |
| Pool | `0x08B7F322a12FBee6B6E1e745302D12422465533D` |

Use:

- `app/lib/arcChain.ts` for viem/wagmi chain config.
- `app/lib/addresses.ts` for contract addresses.
- `app/lib/abi.ts` for the pool ABI.

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
