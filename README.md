# Stake-and-Advance

Your customers are the bank.

This is a per-company credit pool on Arc. Customers deposit USDC and receive NAV-based shares.
The pool lends an AI-underwritten, undercollateralized, interest-bearing credit line to one company.
Interest payments raise NAV for all share holders. A default writes down outstanding principal and
lowers NAV, so members bear credit risk pro-rata.

The return comes from debt repayment, not equity appreciation. Compared with Aave, the company can
borrow without already having the full amount posted as collateral. Compared with institutional credit
pools, the lenders are the company's own customers.

## Integrations

| Integration | Role |
| --- | --- |
| Arc | USDC settlement and the pool contract |
| Chainlink CRE / Confidential AI | Underwrites credit cap plus interest rate and delivers terms onchain |
| Dynamic seam | `depositFor(member, amount)` supports relayer or embedded-wallet deposits |
| Unlink seam | Future private balances/positions |

Paid USDC deposits are the access gate; no separate personhood gate is needed.

## Commands

```bash
npm run build
npm test
npm run e2e:local
npm run server:local
npm run deploy:arc
```

`npm run e2e:local` starts Anvil, deploys contracts, starts the backend in process, underwrites a
company, runs deposits, drawdown, interest repayment, profitable redemption, default, and loss
redemption.

## Backend

```bash
npm run server
```

Endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Server status and mode |
| `GET` | `/pool/state` | Live pool NAV, cash, debt, cap, rate, default status |
| `POST` | `/cre/underwrite` | Run underwriting and submit `onReport` |

## Contract Mechanics

`totalAssets = cash + outstandingPrincipal`.

Deposits mint shares at NAV. Redemptions burn shares at NAV and are bounded by liquid cash. The
company can draw up to the active Chainlink-delivered cap and available lendable cash. Interest is
cash-basis: unpaid accrued interest is tracked as debt but is not counted as a pool asset until paid.

Default is permissionless after `dueAt + defaultGracePeriod`. `markDefaulted()` writes off outstanding
principal and lowers NAV.

## Files

- [StakeAndAdvance.sol](/Users/lakshkumar/Desktop/SaaS/contracts/src/StakeAndAdvance.sol): pool, shares, credit line, default accounting.
- [creditUnderwriting.ts](/Users/lakshkumar/Desktop/SaaS/cre/src/creditUnderwriting.ts): cap plus APR model.
- [server/index.ts](/Users/lakshkumar/Desktop/SaaS/server/index.ts): backend API.
- [FRONTEND.md](/Users/lakshkumar/Desktop/SaaS/FRONTEND.md): frontend handoff.
