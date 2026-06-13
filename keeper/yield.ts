import { getYieldQuote } from "../app/lib/lifi";

async function main() {
  const treasuryAddress = required("TREASURY_ADDRESS");
  const fromAmount = required("FROM_AMOUNT");
  const toChain = Number(required("TO_CHAIN"));
  const toToken = required("TO_TOKEN");

  if (!Number.isSafeInteger(toChain) || toChain <= 0) {
    throw new Error("TO_CHAIN must be a positive integer");
  }

  const quote = await getYieldQuote({
    treasuryAddress,
    fromAmount,
    toChain,
    toToken,
    slippage: process.env.SLIPPAGE ? Number(process.env.SLIPPAGE) : undefined,
  });

  console.log(JSON.stringify(quote, null, 2));
}

function required(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
