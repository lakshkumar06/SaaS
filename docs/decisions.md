# Stake-and-Advance Decisions

Last updated: 2026-06-13

## Arc Testnet

- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Faucet: `https://faucet.circle.com`
- Native gas token: USDC
- ERC-20 USDC interface: `0x3600000000000000000000000000000000000000`
- ERC-20 USDC decimals: `6`
- Foundry EVM version: `shanghai`

Use the ERC-20 USDC interface for all balances, allowances, and transfers. Arc's
native gas token exposes 18 decimals, while the ERC-20 interface exposes 6
decimals.

## LI.FI Composer

- API base URL: `https://li.quest/v1`
- API key: optional for baseline usage, provided via `x-lifi-api-key` when set
- Composer detection: returned quote has `tool === "composer"`
- Yield routing: Composer activates when `toToken` is a supported
  vault/staking/deposit token.

Arc destination support and yield venue availability still need a live
`/chains?chainTypes=EVM` and quote check from the target demo wallet. If Arc yield
is unavailable, route collateral to Base Aave V3 as the TDD fallback.

## Chainlink CRE

- Contract receiver entry point: `onReport(bytes metadata, bytes report)`
- Trust boundary: `msg.sender` must be the KeystoneForwarder address for the
  selected network.
- Report payload for this MVP:
  `abi.encode(address vendor, uint256 cap, uint64 expiry, uint16 creditAllocationBps)`
- Confidential inference path: CRE Confidential HTTP request with sandbox
  endpoint/API key supplied outside the repository.
- Credit-limit policy:
  - vendor history comes from this platform's onchain repayment track record
  - the contract exposes drawdowns, repayment count, on-time repayments, late
    repayments, total repaid, current outstanding debt, and current debt due date
  - Chainlink CRE determines `creditAllocationBps`, the percentage of user
    principal that becomes vendor borrowable supply on new deposits
  - if no platform history exists, `creditAllocationBps` defaults to `40%`
  - if platform history exists, CRE raises or lowers `creditAllocationBps` from
    on-time repayment rate, repayment depth, repaid volume, late payments,
    current outstanding debt, confidential AI risk score, delinquency, and burn
  - CRE also reports `cap`, a risk ceiling; the contract enforces the final
    borrow limit as `min(vendorCreditAllocationTotal, vendorCreditCap)`

The Arc testnet KeystoneForwarder address still needs final confirmation from
the current Chainlink forwarder directory or hackathon resources before deploy.
