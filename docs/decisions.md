# Decisions

Last updated: 2026-06-13

## Product

The system is a per-company USDC credit pool. Members deposit for NAV shares. The company borrows
from the pool under Chainlink-delivered terms. Interest paid raises NAV. Defaults lower NAV.

## Accounting

`totalAssets = cash + outstandingPrincipal`.

Accrued but unpaid interest is not counted as an asset. This avoids promising members money that has
not actually been paid into the pool.

## Access Gate

The product uses paid USDC deposits as the gate. There is no separate personhood or free-tier gate in
the current architecture.

## Chainlink

`onReport(bytes,bytes)` accepts:

```solidity
abi.encode(address company, uint256 cap, uint64 expiry, uint16 interestRateBps)
```

The authorized reporter is `keystoneForwarder`. On Arc testnet this is configured as the reporter
address used by the workflow/backend. The reporter computes a cap and APR from confidential financials
and repayment track record.

## Arc

Arc testnet:

- chain id: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- explorer: `https://testnet.arcscan.app`
- USDC: `0x3600000000000000000000000000000000000000`

Use the ERC-20 USDC interface for balances, allowances, deposits, and repayments.

## Default

Anyone can call `markDefaulted()` when principal is outstanding and `block.timestamp` is past
`dueAt + defaultGracePeriod`. Principal is written off, unpaid interest is cleared, and NAV falls.

## Access Seams

`depositFor(member, amount)` supports relayer or embedded-wallet onboarding. This is the Dynamic seam.
Private position display is left as an Unlink seam.
