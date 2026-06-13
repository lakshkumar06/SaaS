import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_USDC, STAKE_AND_ADVANCE_ADDRESS } from "./addresses";

const LIFI_BASE_URL = "https://li.quest/v1";
const DEPOSIT_SELECTOR = "0x47e7ef24";
const DEFAULT_DEPOSIT_GAS_LIMIT = "350000";

export type IntakeQuoteInput = {
  fromChain: number;
  fromToken: string;
  fromAmount: string;
  fromAddress: string;
  user: string;
  slippage?: number;
  toContractGasLimit?: string;
};

export type YieldQuoteInput = {
  fromAmount: string;
  treasuryAddress: string;
  toChain: number;
  toToken: string;
  slippage?: number;
};

export type LifiTransactionRequest = {
  from?: string;
  to: string;
  chainId: number;
  data?: `0x${string}`;
  value?: string;
  gasLimit?: string;
  gasPrice?: string;
};

export type LifiQuoteResponse = {
  ok: boolean;
  status?: number;
  error?: unknown;
  quote?: {
    id?: string;
    tool?: string;
    transactionRequest?: LifiTransactionRequest;
    includedSteps?: Array<{ tool?: string; type?: string }>;
    estimate?: unknown;
  };
  isComposer?: boolean;
  includedTools?: string[];
};

export function encodeDepositCall(user: string, amount: string): `0x${string}` {
  const normalizedUser = normalizeAddress(user);
  const normalizedAmount = BigInt(amount);
  if (normalizedAmount <= 0n) {
    throw new Error("amount must be positive");
  }

  const encodedUser = normalizedUser.slice(2).padStart(64, "0");
  const encodedAmount = normalizedAmount.toString(16).padStart(64, "0");
  return `${DEPOSIT_SELECTOR}${encodedUser}${encodedAmount}` as `0x${string}`;
}

export async function getIntakeQuote(input: IntakeQuoteInput) {
  const calldata = encodeDepositCall(input.user, input.fromAmount);
  const body = {
    fromChain: String(input.fromChain),
    toChain: String(ARC_TESTNET_CHAIN_ID),
    fromToken: normalizeAddress(input.fromToken),
    toToken: ARC_TESTNET_USDC,
    toAmount: input.fromAmount,
    fromAddress: normalizeAddress(input.fromAddress),
    integrator: "stake-and-advance",
    slippage: input.slippage ?? 0.005,
    allowDestinationCall: true,
    contractCalls: [
      {
        fromAmount: input.fromAmount,
        fromTokenAddress: ARC_TESTNET_USDC,
        toTokenAddress: ARC_TESTNET_USDC,
        toContractAddress: STAKE_AND_ADVANCE_ADDRESS,
        toContractCallData: calldata,
        toContractGasLimit: input.toContractGasLimit ?? DEFAULT_DEPOSIT_GAS_LIMIT,
        toFallbackAddress: normalizeAddress(input.user),
      },
    ],
  };

  return fetchLifiContractCallsQuote(body);
}

export async function getYieldQuote(input: YieldQuoteInput) {
  const treasury = normalizeAddress(input.treasuryAddress);
  const params = new URLSearchParams({
    fromChain: String(ARC_TESTNET_CHAIN_ID),
    toChain: String(input.toChain),
    fromToken: ARC_TESTNET_USDC,
    toToken: normalizeAddress(input.toToken),
    fromAmount: input.fromAmount,
    fromAddress: treasury,
    toAddress: treasury,
    integrator: "stake-and-advance",
    slippage: String(input.slippage ?? 0.005),
  });

  return fetchLifiQuote(params);
}

export async function getLifiStatus(input: {
  txHash: string;
  fromChain: number;
  toChain: number;
  bridge?: string;
}) {
  const params = new URLSearchParams({
    txHash: input.txHash,
    fromChain: String(input.fromChain),
    toChain: String(input.toChain),
  });
  if (input.bridge) {
    params.set("bridge", input.bridge);
  }

  const response = await fetch(`${LIFI_BASE_URL}/status?${params.toString()}`, {
    headers: lifiHeaders(),
    cache: "no-store",
  });

  const body = await response.json();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: body,
    };
  }

  return {
    ok: true,
    status: response.status,
    result: body,
  };
}

function lifiHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (process.env.LIFI_API_KEY) {
    headers["x-lifi-api-key"] = process.env.LIFI_API_KEY;
  }

  if (json) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

async function fetchLifiQuote(params: URLSearchParams): Promise<LifiQuoteResponse> {
  const response = await fetch(`${LIFI_BASE_URL}/quote?${params.toString()}`, {
    headers: lifiHeaders(),
    cache: "no-store",
  });

  return parseLifiQuoteResponse(response);
}

async function fetchLifiContractCallsQuote(body: unknown): Promise<LifiQuoteResponse> {
  const response = await fetch(`${LIFI_BASE_URL}/quote/contractCalls`, {
    method: "POST",
    headers: lifiHeaders(true),
    body: JSON.stringify(body),
    cache: "no-store",
  });

  return parseLifiQuoteResponse(response);
}

async function parseLifiQuoteResponse(response: Response): Promise<LifiQuoteResponse> {
  const body = await response.json();

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: body,
    };
  }

  return {
    ok: true,
    quote: body,
    isComposer: body?.tool === "composer",
    includedTools: Array.isArray(body?.includedSteps)
      ? body.includedSteps.map((step: { tool?: string }) => step.tool).filter(Boolean)
      : [],
  };
}

function normalizeAddress(value: string): `0x${string}` {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`invalid EVM address: ${value}`);
  }
  return value.toLowerCase() as `0x${string}`;
}
