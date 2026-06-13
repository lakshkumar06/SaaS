import {
  createPublicClient,
  createWalletClient,
  defineChain,
  erc20Abi,
  http,
  isAddressEqual,
  type Chain,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  ARC_TESTNET_CHAIN_ID,
  STAKE_AND_ADVANCE_ADDRESS,
} from "../app/lib/addresses";
import { getLifiStatus, type LifiQuoteResponse } from "../app/lib/lifi";

export type EvmChainConfig = {
  id: number;
  name: string;
  rpcUrl: string;
};

export type ExecuteLifiQuoteInput = {
  quote: LifiQuoteResponse;
  privateKey: Hex;
  sourceChain: EvmChainConfig;
  approval?: {
    token: Hex;
    spender: Hex;
    amount: bigint;
  };
  destinationChainId: number;
  pollStatus?: boolean;
  pollIntervalMs?: number;
  maxPolls?: number;
};

export async function executeLifiQuote(input: ExecuteLifiQuoteInput) {
  const transactionRequest = input.quote.quote?.transactionRequest;
  if (!input.quote.ok || !transactionRequest) {
    throw new Error("LI.FI quote did not include an executable transactionRequest");
  }

  const account = privateKeyToAccount(input.privateKey);
  const chain = makeChain(input.sourceChain);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(input.sourceChain.rpcUrl),
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(input.sourceChain.rpcUrl),
  });

  if (input.approval && !isNativeToken(input.approval.token)) {
    await approveIfNeeded({
      publicClient,
      walletClient,
      account: account.address,
      token: input.approval.token,
      spender: input.approval.spender,
      amount: input.approval.amount,
    });
  }

  const hash = await walletClient.sendTransaction({
    account,
    chain,
    to: transactionRequest.to as Hex,
    data: transactionRequest.data,
    value: transactionRequest.value ? BigInt(transactionRequest.value) : 0n,
    gas: transactionRequest.gasLimit ? BigInt(transactionRequest.gasLimit) : undefined,
    gasPrice: transactionRequest.gasPrice ? BigInt(transactionRequest.gasPrice) : undefined,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const status = input.pollStatus === false
    ? undefined
    : await pollLifiStatus({
      txHash: hash,
      fromChain: input.sourceChain.id,
      toChain: input.destinationChainId,
      bridge: input.quote.quote?.tool,
      pollIntervalMs: input.pollIntervalMs,
      maxPolls: input.maxPolls,
    });

  return {
    hash,
    receipt,
    status,
  };
}

export async function approveIfNeeded(input: {
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  account: Hex;
  token: Hex;
  spender: Hex;
  amount: bigint;
}) {
  const allowance = await input.publicClient.readContract({
    address: input.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [input.account, input.spender],
  });

  if (allowance >= input.amount) return undefined;

  const hash = await input.walletClient.writeContract({
    address: input.token,
    abi: erc20Abi,
    functionName: "approve",
    args: [input.spender, input.amount],
    account: input.account,
    chain: null,
  });

  return input.publicClient.waitForTransactionReceipt({ hash });
}

export async function pollLifiStatus(input: {
  txHash: Hash;
  fromChain: number;
  toChain: number;
  bridge?: string;
  pollIntervalMs?: number;
  maxPolls?: number;
}) {
  const pollIntervalMs = input.pollIntervalMs ?? 10_000;
  const maxPolls = input.maxPolls ?? 60;
  let latest: unknown;

  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
    const status = await getLifiStatus({
      txHash: input.txHash,
      fromChain: input.fromChain,
      toChain: input.toChain,
      bridge: input.bridge,
    });
    latest = status;

    const resultStatus = status.ok && "result" in status
      ? (status.result as { status?: string }).status
      : undefined;
    if (resultStatus === "DONE" || resultStatus === "FAILED") {
      return status;
    }

    await sleep(pollIntervalMs);
  }

  return latest;
}

export function makeChain(config: EvmChainConfig): Chain {
  return defineChain({
    id: config.id,
    name: config.name,
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [config.rpcUrl],
      },
    },
  });
}

export function chainFromEnv(prefix: string): EvmChainConfig {
  const id = Number(required(`${prefix}_CHAIN_ID`));
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`${prefix}_CHAIN_ID must be a positive integer`);
  }

  return {
    id,
    name: process.env[`${prefix}_CHAIN_NAME`] ?? `chain-${id}`,
    rpcUrl: required(`${prefix}_RPC_URL`),
  };
}

export function arcDestinationChainId() {
  return ARC_TESTNET_CHAIN_ID;
}

export function stakeAndAdvanceAddress() {
  return STAKE_AND_ADVANCE_ADDRESS;
}

export function isNativeToken(token: string) {
  return isAddressEqual(
    token as Hex,
    "0x0000000000000000000000000000000000000000",
  ) || isAddressEqual(
    token as Hex,
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  );
}

export function required(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
}

export function optionalNumber(key: string) {
  const raw = process.env[key];
  if (!raw) return undefined;

  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${key} must be a number`);
  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
