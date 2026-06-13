import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { arcTestnet } from "../app/lib/arcChain";
import {
  ARC_TESTNET_USDC,
  STAKE_AND_ADVANCE_ADDRESS,
} from "../app/lib/addresses";
import { getYieldQuote } from "../app/lib/lifi";
import {
  approveIfNeeded,
  executeLifiQuote,
  optionalNumber,
  required,
} from "./lifiExecution";

const stakeAndAdvanceAbi = parseAbi([
  "function pullCollateralForYield(uint256 amount)",
]);

async function main() {
  const privateKey = required("PRIVATE_KEY") as Hex;
  const account = privateKeyToAccount(privateKey);
  const fromAmount = required("FROM_AMOUNT");
  const toChain = Number(required("TO_CHAIN"));
  const toToken = required("TO_TOKEN") as Hex;
  const arcRpcUrl = process.env.ARC_RPC_URL ?? arcTestnet.rpcUrls.default.http[0];
  const slippage = optionalNumber("SLIPPAGE");

  if (!Number.isSafeInteger(toChain) || toChain <= 0) {
    throw new Error("TO_CHAIN must be a positive integer");
  }

  const quote = await getYieldQuote({
    treasuryAddress: account.address,
    fromAmount,
    toChain,
    toToken,
    slippage,
  });

  console.log(JSON.stringify({ stage: "yield_quote", quote }, null, 2));
  if (!quote.ok || process.env.QUOTE_ONLY === "1") return;

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(arcRpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(arcRpcUrl),
  });

  const pullHash = await walletClient.writeContract({
    address: STAKE_AND_ADVANCE_ADDRESS,
    abi: stakeAndAdvanceAbi,
    functionName: "pullCollateralForYield",
    args: [BigInt(fromAmount)],
  });
  const pullReceipt = await publicClient.waitForTransactionReceipt({ hash: pullHash });
  console.log(JSON.stringify({ stage: "collateral_pulled", hash: pullHash, pullReceipt }, null, 2));

  const approvalAddress = quote.quote?.estimate && typeof quote.quote.estimate === "object"
    ? (quote.quote.estimate as { approvalAddress?: string }).approvalAddress
    : undefined;
  if (approvalAddress) {
    await approveIfNeeded({
      publicClient,
      walletClient,
      account: account.address,
      token: ARC_TESTNET_USDC,
      spender: approvalAddress as Hex,
      amount: BigInt(fromAmount),
    });
  }

  const result = await executeLifiQuote({
    quote,
    privateKey,
    sourceChain: {
      id: arcTestnet.id,
      name: arcTestnet.name,
      rpcUrl: arcRpcUrl,
    },
    destinationChainId: toChain,
    pollIntervalMs: optionalNumber("POLL_INTERVAL_MS"),
    maxPolls: optionalNumber("MAX_POLLS"),
  });

  console.log(JSON.stringify({ stage: "yield_executed", result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
