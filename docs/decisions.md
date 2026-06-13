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

## World ID Personhood

- Purpose: one free subscription claim per verified human.
- Backend route: `POST /worldid/verify`.
- Dev mode: `WORLD_ID_MODE=dev` issues a deterministic nullifier for terminal
  testing without a World App QR flow.
- Cloud mode: `WORLD_ID_MODE=cloud` forwards the IDKit proof to
  `WORLD_VERIFY_URL` with `WORLD_APP_ID`, `WORLD_ACTION`, and the user signal.
- Contract path:
  `depositWithPersonhood(address user, uint256 amount, bytes32 nullifierHash, uint64 deadline, bytes signature)`.
- Voucher: backend signs EIP-712
  `Personhood(address user, bytes32 nullifierHash, uint64 deadline)` with
  `WORLD_ID_SIGNER_PRIVATE_KEY`.
- Replay protection: the contract stores `usedNullifier[nullifierHash]`, so the
  same personhood nullifier cannot claim twice.
- Vendor setup: after deploy, the vendor calls `setWorldIdSigner(address)` with
  the backend signer address.

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
  - `creditAllocationBps` has a hard maximum of `70%`; neither CRE nor a bad
    report can increase borrowable supply above that ceiling
  - CRE also reports `cap`, a risk ceiling; the contract enforces the final
    borrow limit as `min(vendorCreditAllocationTotal, vendorCreditCap)`

The Arc testnet KeystoneForwarder address still needs final confirmation from
the current Chainlink forwarder directory or hackathon resources before deploy.
