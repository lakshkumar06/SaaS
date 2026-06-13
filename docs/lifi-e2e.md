# LI.FI End-to-End Flow

This project uses LI.FI in two places:

- Cross-chain checkout intake: source-chain USDC to Arc, then call `deposit(user, amount)`.
- Collateral yield routing: treasury pulls Arc USDC collateral, then LI.FI routes it to a yield token.

## 1. Cross-Chain Checkout Intake

Use quote-only mode first:

```bash
QUOTE_ONLY=1 \
PRIVATE_KEY=0x... \
FROM_CHAIN_ID=<source-chain-id> \
FROM_CHAIN_NAME=<source-chain-name> \
FROM_RPC_URL=<source-rpc-url> \
FROM_TOKEN=<source-usdc-address> \
FROM_AMOUNT=<amount-in-source-token-units> \
USER_ADDRESS=<stake-owner-address> \
npm run lifi:intake
```

If LI.FI returns a valid quote, run the same command without `QUOTE_ONLY=1`:

```bash
PRIVATE_KEY=0x... \
FROM_CHAIN_ID=<source-chain-id> \
FROM_CHAIN_NAME=<source-chain-name> \
FROM_RPC_URL=<source-rpc-url> \
FROM_TOKEN=<source-usdc-address> \
FROM_AMOUNT=<amount-in-source-token-units> \
USER_ADDRESS=<stake-owner-address> \
npm run lifi:intake
```

The script:

- requests `POST https://li.quest/v1/quote/contractCalls`
- encodes `deposit(user, amount)`
- approves LI.FI's spender if needed
- sends the LI.FI transaction
- polls LI.FI status until the transfer is done or failed

## 2. Collateral To Yield

Use quote-only mode first:

```bash
QUOTE_ONLY=1 \
PRIVATE_KEY=0x... \
ARC_RPC_URL=https://rpc.testnet.arc.network \
FROM_AMOUNT=<arc-usdc-amount> \
TO_CHAIN=<yield-chain-id> \
TO_TOKEN=<yield-token-address> \
npm run lifi:yield
```

If LI.FI returns a valid quote, run the same command without `QUOTE_ONLY=1`:

```bash
PRIVATE_KEY=0x... \
ARC_RPC_URL=https://rpc.testnet.arc.network \
FROM_AMOUNT=<arc-usdc-amount> \
TO_CHAIN=<yield-chain-id> \
TO_TOKEN=<yield-token-address> \
npm run lifi:yield
```

The script:

- requests a LI.FI quote from Arc USDC to the selected yield token
- calls `pullCollateralForYield(amount)` from the treasury wallet
- approves LI.FI's spender if needed
- sends the LI.FI transaction
- polls LI.FI status until the transfer is done or failed

## Notes

- `PRIVATE_KEY` must be the wallet that owns the source-chain tokens for intake.
- For yield, `PRIVATE_KEY` must be the contract treasury wallet.
- `STAKE_AND_ADVANCE_ADDRESS` must point to the latest deployed contract.
- Use tiny test amounts until LI.FI route support and liquidity are confirmed.
