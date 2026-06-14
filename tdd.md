

Skip to content
Using Gmail with screen readers
1 of 568
(no subject)
Inbox

Laksh Kumar
Attachments
1:46 AM (45 minutes ago)
 

Laksh Kumar
Attachments
2:30 AM (1 minute ago)
to me



On Sat, Jun 13, 2026 at 1:46 AM Laksh Kumar <krathi.laksh@gmail.com> wrote:


 One attachment
  •  Scanned by Gmail
# TDD — Stake-and-Advance: AI-Underwritten Undercollateralized USDC Credit Line on Arc

> Technical design doc + ordered, executable build steps. Tests gate the Solidity contract (the core); TypeScript glue is verified by running it end-to-end.

---

## 1. What we're building

**Stake-and-Advance** is a subscription-checkout primitive that turns a user's deposit into an on-chain revolving credit line for a vendor.

- A user stakes USDC instead of paying a recurring subscription fee. The principal stays theirs — they withdraw it when they cancel.
- Each stake is split into two tranches: a **collateral tranche** (60%) routed into a yield position whose interest streams to the vendor (their baseline revenue), and a **credit allocation** (40%) that raises the vendor's borrowable limit.
- A vendor can **draw down** liquid USDC up to an AI-underwritten credit limit, and **repay** to free it up.
- On cancel, the contract settles conditionally: if the vendor has not drawn against the user's allocation, the user is refunded in full; if it has, the user gets their collateral back immediately and the un-returned allocation becomes a priority debt the vendor must repay.
- Disputes are handled on-chain with an arbiter path and a time-based automatic release.

The build is delivered against three bounties; each maps to a concrete part of the system:

| Bounty | Requirements | Deliverable in this project |
|---|---|---|
| **Circle / Arc — Advanced Stablecoin Logic** | Conditional escrow + onchain dispute + automatic release; multi-step settlement in USDC/EURC; working FE+BE + architecture diagram + video | `StakeAndAdvance.sol` on Arc: tranche split, per-vendor credit limit, drawdown/repay, conditional cancel/settlement, `raiseDispute` + arbiter resolution + time-based `autoRelease`. All USDC. |
| **Chainlink — Confidential AI Attester** | Use the Confidential AI inference APIs; ≥1 confidential inference request via the sandbox; process sensitive inputs (financial docs); a state change driven by Chainlink | A CRE workflow underwrites vendor creditworthiness from confidential financials → signed report → `onReport` on Arc sets `vendorCreditCap`. Borrowing is impossible (limit = 0) until the attestation arrives, so it is load-bearing. |
| **LI.FI — Composer** | Composer is core; multi-step workflow; ≥2 EVM chains; working FE; real (non-mocked) LI.FI calls; demo + video | (a) **Intake flow**: user USDC on chain X → Composer (swap + CCTP bridge to Arc) → custom call `deposit(user,amount)` in one signature. (b) **Yield flow**: collateral USDC → Composer → bridge → Aave supply → receipt token; unwind on withdrawal. |

**Definition of done:** a deployed MVP (frontend + backend + Arc contract) where a user checks out from any chain → USDC lands on Arc and is staked → an AI attestation sets the vendor's credit limit → collateral is routed to yield via Composer → the vendor draws/repays → the user cancels with correct conditional settlement, including a dispute + auto-release path.

---

## 2. Architecture

```
                ┌───────────────────────────────────────────────┐
                │  React app (Vite dashboard + widgets)          │
                │  - connect wallet (Dynamic/viem)               │
                │  - LI.FI Composer intake & withdraw            │
                └───────────────┬───────────────────────────────┘
                                │ getQuote / executeRoute (@lifi/sdk)
            user USDC (any EVM chain) │ swap → CCTP bridge → custom call
                                ▼
   ┌────────────────────────────────────────────────────────────────┐
   │                ARC TESTNET (chainId 5042002, gas = USDC)         │
   │  ┌──────────────────────────┐      onReport(report)             │
   │  │   StakeAndAdvance.sol     │◄──────────────┐                   │
   │  │  - deposit(user, amount)  │   KeystoneForwarder (validates    │
   │  │  - tranche split 60/40    │   DON sigs)                       │
   │  │  - vendorCreditCap (AI)   │                ▲                  │
   │  │  - drawdown / repay       │                │ writeReport      │
   │  │  - cancel / settle        │      ┌─────────┴───────────┐      │
   │  │  - raiseDispute/autoRelease      │  Chainlink CRE        │     │
   │  │  - IReceiver.onReport     │      │  workflow (TS)        │     │
   │  └─────────┬────────────────┘      │  Confidential AI infer│     │
   │            │ collateral tranche     │  (sandbox) → score    │     │
   └────────────┼───────────────────────┴───────────────────────┘     
                │ treasury/keeper routes via @lifi/sdk
                ▼
   ┌──────────────────────────┐   Composer: bridge + Aave supply()
   │  Yield venue (Aave V3)    │   → receipt token; unwind on withdraw
   │  on Arc if live, else Base│
   └──────────────────────────┘
```

**Component responsibilities**
- **`StakeAndAdvance.sol` (Arc):** custody of USDC, all credit/escrow/settlement accounting, dispute + auto-release, consumes the AI attestation, exposes collateral to a `treasury` role for yield routing. Source of truth.
- **CRE workflow (TS):** off-chain underwriting via the Confidential AI sandbox; emits a signed report that sets `vendorCreditCap`.
- **LI.FI backend/keeper + frontend (TS):** builds and executes Composer flows for intake and yield; holds no custody, pure orchestration.
- **React FE:** checkout widget, vendor dashboard (credit limit, draw/repay), user panel (cancel/dispute).

**Three constraints that shape the code**
- LI.FI Composer's **executor contract is `msg.sender`** on the destination call → `deposit` must take an explicit `user` param and credit *that* address, pulling tokens from the caller. Never key off `msg.sender` for the depositor.
- Arc **native USDC exposes a dual decimal interface (18 native / 6 ERC-20)**. Use the **ERC-20 interface (6 decimals)** everywhere; never compare raw native balances.
- The Chainlink report is consumed via **`onReport(bytes metadata, bytes report)`**; trust is enforced by requiring `msg.sender == keystoneForwarder` (the forwarder validates DON signatures).

---

## 3. Tech stack & dependencies

**Contracts** — Foundry (`forge`, `cast`, `anvil`), Solidity `^0.8.26`, OpenZeppelin (`@openzeppelin/contracts`: `SafeERC20`, `IERC20`, `Ownable2Step`, `ReentrancyGuard`). Set a conservative `evm_version` (start `"shanghai"`; confirm a trivial deploy on Arc before writing real contracts).

**Chainlink CRE** — `@chainlink/cre-sdk` (TS, ~v1.6.0) or `github.com/smartcontractkit/cre-sdk-go`; `cre` CLI (`build` | `simulate` | `deploy`), CLI ≥ v1.0.7 for Arc testnet. Contract side: `IReceiver` (`onReport(bytes,bytes)`), KeystoneForwarder address from the CRE forwarder directory.

**LI.FI** — `@lifi/sdk@^4.0.0` + `@lifi/sdk-provider-ethereum`; REST base `https://li.quest/v1/` (`/quote`, `/chains`); optional key via `x-lifi-api-key` (portal.li.fi). No key required for hackathon volume.

**Frontend** — React + Vite + TypeScript, Dynamic + `viem`, Tailwind (optional). Arc added as a custom viem chain (id 5042002).

**Docs to open before coding**
- Arc: `https://developers.circle.com/` (USDC/EURC addresses, CCTP), `https://docs.arc.io/` (connect, EVM compatibility, contract addresses), faucet `https://faucet.circle.com`.
- Chainlink CRE: `https://docs.chain.link/cre`; forwarder directory + supported networks pages; Confidential AI sandbox endpoint/key from the Chainlink hackathon resources/booth/workshop.
- LI.FI: `https://docs.li.fi/composer`, `https://docs.li.fi/composer/ethglobal-ny-2026`, `https://docs.li.fi/api-reference/introduction`.

---

## 4. Repo layout (monorepo)

```
stake-and-advance/
├─ contracts/                 # Foundry
│  ├─ src/StakeAndAdvance.sol
│  ├─ src/interfaces/IReceiver.sol
│  ├─ test/StakeAndAdvance.t.sol
│  ├─ test/Dispute.t.sol
│  ├─ test/Attestation.t.sol
│  ├─ script/Deploy.s.sol
│  └─ foundry.toml
├─ cre/                       # Chainlink CRE workflow (TS)
│  ├─ src/creditUnderwriting.ts
│  ├─ workflow.yaml
│  └─ project.yaml
├─ src/                       # React FE
│  ├─ App.tsx
│  ├─ components/...
│  └─ lib/{arcChain.ts,abi.ts,addresses.ts}
├─ server/                    # backend API
├─ keeper/                    # auto-release + yield-routing cron (TS)
├─ docs/architecture.png
└─ README.md
```

---

## 5. Step 0 — Environment setup & gates (do FIRST; ~30–45 min, no app code)

Confirm the live network specifics and record them. Everything downstream references these values.

- **G0.1 Arc params.** From `faucet.circle.com` + `testnet.arcscan.app`, confirm: chainId `5042002`, RPC `https://rpc.testnet.arc.network`, the USDC ERC-20 address (expected `0x3600000000000000000000000000000000000000`) and its **decimals via `cast call <usdc> "decimals()"`** (expect 6). Fund a dev wallet with testnet USDC (gas is paid in USDC).
- **G0.2 LI.FI Arc support.** `curl "https://li.quest/v1/chains?chainTypes=EVM"` → grep for `5042002`. Determine whether Composer can target Arc directly **and** whether a lending/vault `toToken` exists on Arc. If no yield venue on Arc → the yield flow bridges to **Base** + Aave V3 (still real, exercises Composer cross-chain, satisfies the "≥2 chains" rule). Record the choice.
- **G0.3 Chainlink on Arc.** Confirm Arc testnet is in CRE supported networks and grab the **KeystoneForwarder address** for Arc testnet from the forwarder directory. Get the **Confidential AI sandbox endpoint + API key** from the Chainlink hackathon resources/booth/workshop. If the forwarder is not on Arc testnet → deploy the receiver on a CRE-supported testnet and relay the cap to Arc, OR consume via HTTP report. Record the path.
- **G0.4 Foundry deploy smoke test.** `forge init`, deploy a 1-line `Counter` to Arc testnet with `evm_version="shanghai"`. If it reverts, adjust `evm_version`. De-risks the contract track in 10 minutes.

> Output of Step 0: `docs/decisions.md` capturing the resolved addresses, chain choices, and any fallback path taken.

---

## 6. Build steps

Each step lists **Goal / Files / Notes / Gate**. "Gate" is the concrete check that the step is done. Contract steps gate on Foundry tests; integration steps gate on a real run.

### Phase A — Core contract: stake, split, credit, draw/repay

- **A1. Scaffold + USDC plumbing.**
  - Files: `contracts/foundry.toml`, `src/StakeAndAdvance.sol`, `test/StakeAndAdvance.t.sol`.
  - Notes: `using SafeERC20`. Constructor takes `IERC20 usdc`, `address arbiter`, `uint64 disputeWindow`, `uint16 collateralBps` (=6000). Store `vendor` per deposit (single-vendor MVP is fine; multi-vendor optional). Use a `MockUSDC` (6-dec ERC20) in tests; on-chain uses the real Arc USDC.
  - Gate: `forge build` clean; test that the constructor sets state.

- **A2. `deposit(address user, uint256 amount)`.**
  - Notes: pull `amount` USDC from `msg.sender` (works for both an EOA and the LI.FI executor); credit `user`. Split: `collateral = amount * collateralBps / 10_000` (60%), `creditAllocation = amount - collateral` (40%). Record `Stake{user, amount, collateral, creditAllocation, active:true, createdAt}`. Increase `vendorCreditAllocationTotal += creditAllocation`. Emit `Deposited`.
  - Gate: `test_deposit_splitsTranches` — 250 USDC → collateral 150, allocation 100; balances and totals correct; event emitted. Test deposit-on-behalf (different `msg.sender` vs `user`).

- **A3. Credit limit accounting (default = 0).**
  - Notes: `effectiveCreditLimit(vendor) = min(vendorCreditAllocationTotal, vendorCreditCap[vendor])`. `vendorCreditCap` defaults to 0 → no borrowing until the attestation lands (Phase C). Track `currentOutstandingDebt[vendor]`.
  - Gate: `test_creditLimit_zeroUntilAttested`.

- **A4. `drawdown(uint256 amount)` / `repay(uint256 amount)`.**
  - Notes: vendor-only. `drawdown` requires `currentOutstandingDebt + amount <= effectiveCreditLimit`; transfers USDC to the vendor; `currentOutstandingDebt += amount`. `repay` transfers in and reduces debt. Reentrancy guard on external-transfer functions.
  - Gate: `test_drawdown_withinLimit`, `test_drawdown_revertsOverLimit`, `test_repay_reducesDebt`.

### Phase B — Conditional settlement, dispute, auto-release

- **B1. `cancel()` settlement math.**
  - Notes: a user cancels their stake. Compute the user's share of vendor debt attributable to *their* `creditAllocation`. If the vendor has **not** drawn against this user's allocation → user gets the full `amount` back. If drawn → user gets `collateral` back immediately; the un-returned `creditAllocation` becomes a **priority debt obligation** the vendor must `repay` before unlocking remaining yield. Mark stake `active=false`; decrement `vendorCreditAllocationTotal`; clamp future `effectiveCreditLimit`. Emit `Settled{user, immediateRefund, pendingObligation}`.
  - Gate: `test_cancel_noDraw_fullRefund`, `test_cancel_afterDraw_partialRefund_createsObligation`, `test_cancel_decrementsCreditLimit`.

- **B2. `raiseDispute()` + arbiter resolution.**
  - Notes: user (or vendor) calls `raiseDispute(stakeId)` → state `Disputed`, stamp `disputedAt`. `arbiter` calls `resolveDispute(stakeId, Outcome)` (RefundUser / ReleaseToVendor / Split). Funds move per outcome. Only `arbiter` can resolve before the window elapses.
  - Gate: `test_dispute_lifecycle`, `test_onlyArbiter_resolves`.

- **B3. Time-based `autoRelease(stakeId)`.**
  - Notes: if `Disputed` and `block.timestamp > disputedAt + disputeWindow` with no resolution → anyone can call `autoRelease`, which settles deterministically (default: release escrow per the B1 rule / refund user). This is the automatic release. Use `block.timestamp` (Arc has deterministic finality; `PREVRANDAO` is 0 but unused).
  - Gate: `test_autoRelease_afterWindow`, `test_autoRelease_revertsBeforeWindow` (use `vm.warp`).

### Phase C — Chainlink Confidential AI attestation → credit cap

- **C1. `IReceiver.onReport` on the contract.**
  - Files: `src/interfaces/IReceiver.sol`, extend `StakeAndAdvance.sol`.
  - Notes: store `keystoneForwarder` (from G0.3). `onReport(bytes metadata, bytes report)`: `require(msg.sender == keystoneForwarder)`; `(address vendor, uint256 cap, uint64 expiry) = abi.decode(report,(address,uint256,uint64))`; set `vendorCreditCap[vendor] = cap`, `vendorCapExpiry[vendor] = expiry`; emit `CreditCapUpdated`. Optionally expire stale caps in `effectiveCreditLimit`.
  - Gate: `test_onReport_setsCap_onlyForwarder` (test impersonates the forwarder via `vm.prank`), `test_drawdown_unlockedAfterAttestation`.

- **C2. CRE workflow — confidential underwriting.**
  - Files: `cre/src/creditUnderwriting.ts`, `cre/workflow.yaml`, `cre/project.yaml`.
  - Notes: trigger (HTTP or cron) → read vendor financial inputs (sandbox-provided sample financial docs / revenue) → **confidential inference request to the Chainlink Confidential AI sandbox** (endpoint/key from G0.3) → derive `cap` (e.g., 3× MRR, bounded) → `GenerateReport({EncodedPayload: abi.encode(vendor,cap,expiry), EncoderName:"evm", SigningAlgo:"ecdsa", HashingAlgo:"keccak256"})` → `evmClient.writeReport(stakeAndAdvanceAddr, report)` targeting Arc testnet.
  - Gate: `cre workflow simulate` runs end-to-end (real confidential-inference call + testnet write); `CreditCapUpdated` observed on `testnet.arcscan.app`. Satisfies the "≥1 confidential inference request via sandbox" requirement.

### Phase D — Deploy to Arc testnet

- **D1. Deploy script + addresses.**
  - Files: `script/Deploy.s.sol`, `src/lib/addresses.ts`, `docs/decisions.md`.
  - Notes: deploy with the real Arc USDC, arbiter = dev wallet, forwarder from G0.3, `disputeWindow` ~ 10 min for demo. Verify on Arcscan if supported. Record the address everywhere.
  - Gate: contract live on Arc testnet; a manual `deposit`/`drawdown` via `cast` succeeds.

### Phase E — LI.FI Composer: cross-chain checkout intake

- **E1. Quote API route.**
  - Files: `server/...`, `src/...`.
  - Notes: `createClient({integrator:'stake-and-advance'})`; build a `getQuote` where `fromChain` = user chain, `toChain` = 5042002 (or the resolved route), `fromToken` = user USDC, and the **destination is a custom contract call** to `deposit(user, amount)` via `toContractAddress` + `toContractCallData` (ABI-encode the deposit call). Confirm `quote.tool === 'composer'`.
  - Gate: route returns a Composer quote whose `includedSteps` show swap/bridge + the contract call.

- **E2. Execute from the checkout widget.**
  - Files: `app/checkout/page.tsx`.
  - Notes: wagmi/viem wallet → `executeRoute(route, { updateRouteHook })`; render step progress. After completion, read the new `Stake` from Arc to confirm credit.
  - Gate: real run — staking USDC from a second EVM chain produces an on-chain `Deposited(user, …)` on Arc in **one signature**. (Use Arc testnet, or a low-gas mainnet/fork per G0.2 if testnet bridge liquidity is insufficient.)

### Phase F — LI.FI Composer: collateral → yield, and unwind

- **F1. Yield routing (treasury/keeper).**
  - Files: `app/api/lifi/yield/route.ts`, `keeper/yield.ts`.
  - Notes: the contract exposes collateral to a `treasury` role (`pullCollateralForYield(amount)` → transfers to the treasury wallet, tracks `collateralInYield`). The keeper builds a Composer flow: collateral USDC on Arc → (bridge to Base if needed) → **`toToken` = Aave aUSDC** so Composer auto-deposits → receipt token held by treasury. Track receipt + chain in `docs/decisions.md`/DB.
  - Gate: a real Composer flow deposits into Aave and returns aUSDC; tx visible on the explorer.

- **F2. Unwind on withdrawal.**
  - Notes: on `cancel`, if `collateralInYield > 0`, the keeper runs the reverse Composer flow (redeem aUSDC → bridge back to Arc) so the contract can pay the user. For demo timing, pre-fund a small buffer so `cancel` settles instantly while the unwind runs.
  - Gate: the redeem + bridge-back flow completes; the contract balance covers the refund.

### Phase G — Frontend + glue

- **G1. Checkout widget** (Phase E wired into UI), **G2. Vendor dashboard** (show `vendorCreditCap` from the attestation, `effectiveCreditLimit`, `drawdown`/`repay` buttons), **G3. Account panel** (`cancel`, `raiseDispute`, settlement preview).
  - Gate: a user can click through stake → see the AI-set limit → draw → cancel → see correct settlement, against the live Arc contract.

### Phase H — Demo, diagram, docs

- **H1.** `docs/architecture.png` (the diagram in §2, rendered). **H2.** `README.md` with per-bounty sections ("How we use Arc / Chainlink Confidential AI / LI.FI Composer"). **H3.** A scripted `make demo` (or `pnpm demo`) that runs the happy path end-to-end for the video. **H4.** Maintain a real git commit history — commit per phase (judges dislike a single final-day commit).

---

## 7. End-to-end verification / demo plan

Run this sequence live (it is also the video script):
1. **Underwrite:** `cre workflow simulate` → `CreditCapUpdated(vendor, cap)` on Arcscan. *(Chainlink Confidential AI)*
2. **Stake (cross-chain):** in the checkout widget, pay USDC from chain X → one signature → `Deposited(user, 250)` on Arc; UI shows the split 150/100. *(LI.FI Composer intake)*
3. **Yield:** the keeper routes collateral → Composer → Aave; show the aUSDC receipt tx. *(LI.FI Composer yield)*
4. **Draw:** vendor `drawdown(100)` succeeds only because the cap unlocked it; show `currentOutstandingDebt`. *(Arc + Chainlink)*
5. **Cancel + settle:** user cancels → gets `collateral` back immediately, `100` becomes a vendor priority obligation. *(Arc settlement)*
6. **Dispute + auto-release:** raise a dispute, wait past `disputeWindow`, anyone calls `autoRelease` → deterministic settlement with no arbiter. *(Arc dispute + automatic release)*

Submission checklist: working FE+BE ✔, architecture diagram ✔, ≤3–5 min video ✔, public GitHub + README ✔, real tx IDs/explorer links ✔, confidential-inference request evidence ✔.

---

## 8. Risks & fallbacks

- **Testnet bridge/DEX liquidity for LI.FI** is thin; if Arc-as-destination Composer routes won't fill on testnet, demo the Composer flow on a **low-gas mainnet or a local mainnet fork** (real calls, tiny amounts) and keep the Arc contract interactions on Arc testnet. Resolve in G0.2.
- **Confidential AI sandbox access** must be provisioned for the event — secure creds early (G0.3). Fallback: the CRE workflow calls an LLM over **Confidential HTTP** to underwrite, preserving the confidential-inference path.
- **KeystoneForwarder not on Arc testnet** → deploy the receiver on a CRE-supported testnet and relay the cap to Arc, or consume via HTTP report. Resolve in G0.3.
- **Arc USDC dual decimals (18/6):** always use the 6-decimal ERC-20 interface; never compare native balances. Add a unit test asserting `usdc.decimals() == 6` on the fork.
- **`evm_version` mismatch on Arc:** locked by the G0.4 smoke test before any real contract work.
- **Scope:** Phases A–D + C2 + E are the minimum to satisfy all three bounties. F (yield) and G (polish) are high-value but cuttable under time pressure — A/B/C/E are non-negotiable.

---

## 9. Critical files

- `contracts/src/StakeAndAdvance.sol` — the whole on-chain product (deposit/split/credit/draw/repay/cancel/settle/dispute/autoRelease/onReport).
- `contracts/test/{StakeAndAdvance,Dispute,Attestation}.t.sol` — Foundry gates for §6.
- `cre/src/creditUnderwriting.ts` — Confidential AI → signed report → Arc.
- `server/...`, `src/...` — Composer intake.
- `app/api/lifi/yield/route.ts`, `keeper/yield.ts` — Composer yield routing + unwind.
- `script/Deploy.s.sol`, `src/lib/{arcChain,addresses,abi}.ts`, `docs/architecture.png`, `README.md`.
TDD.md
Displaying TDD.md.
