import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

import { getIntakeQuote } from "../app/lib/lifi";
import {
  arcDestinationChainId,
  chainFromEnv,
  executeLifiQuote,
  optionalNumber,
  required,
} from "./lifiExecution";

async function main() {
  const privateKey = required("PRIVATE_KEY") as Hex;
  const account = privateKeyToAccount(privateKey);
  const sourceChain = chainFromEnv("FROM");
  const fromToken = required("FROM_TOKEN") as Hex;
  const fromAmount = required("FROM_AMOUNT");
  const user = (process.env.USER_ADDRESS ?? account.address) as Hex;
  const slippage = optionalNumber("SLIPPAGE");

  const quote = await getIntakeQuote({
    fromChain: sourceChain.id,
    fromToken,
    fromAmount,
    fromAddress: account.address,
    user,
    slippage,
    toContractGasLimit: process.env.DEPOSIT_GAS_LIMIT,
  });

  console.log(JSON.stringify({ stage: "intake_quote", quote }, null, 2));
  if (!quote.ok || process.env.QUOTE_ONLY === "1") return;

  const approvalAddress = quote.quote?.estimate && typeof quote.quote.estimate === "object"
    ? (quote.quote.estimate as { approvalAddress?: string }).approvalAddress
    : undefined;

  const result = await executeLifiQuote({
    quote,
    privateKey,
    sourceChain,
    approval: approvalAddress
      ? {
        token: fromToken,
        spender: approvalAddress as Hex,
        amount: BigInt(fromAmount),
      }
      : undefined,
    destinationChainId: arcDestinationChainId(),
    pollIntervalMs: optionalNumber("POLL_INTERVAL_MS"),
    maxPolls: optionalNumber("MAX_POLLS"),
  });

  console.log(JSON.stringify({ stage: "intake_executed", result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
