# Stake-and-Advance

**Your customers are the bank.**

Stake-and-Advance is a per-company USDC credit pool on Arc. A company's customers deposit USDC,
receive NAV-based shares, and collectively fund an AI-underwritten credit line for that company.
When the company repays with interest, NAV rises and members earn the spread. If the company
defaults, outstanding principal is written down and NAV falls.

This is debt, not equity. The return comes from company interest payments, not cap-table upside.
It is undercollateralized credit for a real company, unlike Aave-style overcollateralized borrowing,
and the lenders are the company's own customers rather than institutional LPs.

## Live Demo Targets

| Item | Value |
| --- | --- |
| Chain | Arc testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| USDC | `0x3600000000000000000000000000000000000000` |
| Pool contract | `0xC18036FfFfa6D5A861EbA9bd1084b68BC3321c40` |

Frontend wiring lives in [FRONTEND.md](/Users/lakshkumar/Desktop/SaaS/FRONTEND.md).

## What The Demo Shows

1. Chainlink underwriting sets a company credit cap and interest rate.
2. Customers deposit USDC and receive pool shares at current NAV.
3. The company draws from available pool liquidity.
4. Repayment with interest raises NAV, so members can redeem at a profit.
5. If debt passes `dueAt + defaultGracePeriod`, anyone can call `markDefaulted()`.
6. Default writes down principal and lowers NAV, so remaining members bear the loss.

The terminal demo proves the full lifecycle locally:

```bash
npm run e2e:local
```

## Integrations

| Integration | Role |
| --- | --- |
| Arc | USDC settlement and pool contract |
| Chainlink CRE / Confidential AI | Computes credit cap plus risk-priced APR and delivers terms onchain |
| Dynamic-ready seam | `depositFor(member, amount)` supports embedded-wallet or relayer deposits |
| Unlink-ready seam | Future private member positions and balances |

Paid USDC deposits are the access gate; there is no separate personhood gate.

## Commands

```bash
npm run build          # forge build --root contracts
npm test               # 26 Foundry tests
npm run e2e:local      # local Anvil lifecycle demo
npm run server:local   # local Anvil + deploy + backend on :8788
npm run server         # backend using .env
npm run deploy:arc     # deploy to Arc testnet using .env
```

Verification currently passes:

- `forge test --root contracts`: 26 tests
- `npx tsc --noEmit`
- `npm run e2e:local`: deposit, underwrite, drawdown, interest repayment, profit redeem, default, loss redeem

## Backend API

Run:

```bash
npm run server
```

Endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Server status, chain, contract, underwriting mode |
| `GET` | `/pool/state` | NAV, cash, debt, shares, cap, APR, due date, default flag |
| `POST` | `/cre/underwrite` | Runs underwriting and submits `onReport(bytes,bytes)` |

Example underwriting request:

```bash
curl -X POST localhost:8788/cre/underwrite \
  -H 'content-type: application/json' \
  -d '{"vendor":"0x19E95b026731974B7c1feD9eb3c3113fBDD80464","currentDepositedPrincipalUsdc":250,"monthlyRecurringRevenueUsd":5000,"grossMarginBps":8000,"cashBalanceUsd":50000,"monthlyBurnUsd":20000,"delinquencyRateBps":100}'
```

## Contract Mechanics

Core accounting:

```text
totalAssets = cash + outstandingPrincipal
NAV/share   = totalAssets / totalShares
```

Deposits mint shares at current NAV. Redemptions burn shares at NAV and are bounded by liquid cash.
The company can draw up to the active Chainlink-delivered cap and available lendable cash. Interest is
cash-basis: accrued unpaid interest is tracked, but it is not counted as a pool asset until paid.

Default is permissionless after the grace window. `markDefaulted()` writes off outstanding principal,
clears unpaid interest, and lowers NAV.

## Main Files

- [StakeAndAdvance.sol](/Users/lakshkumar/Desktop/SaaS/contracts/src/StakeAndAdvance.sol): pool, shares, credit line, default accounting.
- [creditUnderwriting.ts](/Users/lakshkumar/Desktop/SaaS/cre/src/creditUnderwriting.ts): cap plus APR model.
- [server/index.ts](/Users/lakshkumar/Desktop/SaaS/server/index.ts): backend API.
- [scripts/e2e.local.ts](/Users/lakshkumar/Desktop/SaaS/scripts/e2e.local.ts): local lifecycle demo.
