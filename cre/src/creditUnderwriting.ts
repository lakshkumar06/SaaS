import { encodeAbiParameters, parseAbiParameters } from "viem";

export type FinancialInputs = {
  vendor: `0x${string}`;
  currentCreditAllocationUsdc: number;
  monthlyRecurringRevenueUsd: number;
  grossMarginBps: number;
  cashBalanceUsd: number;
  monthlyBurnUsd: number;
  delinquencyRateBps: number;
  platformTrackRecord?: PlatformTrackRecord | null;
};

export type PlatformTrackRecord = {
  drawdownCount: number;
  repaymentCount: number;
  onTimeRepaymentCount: number;
  lateRepaymentCount: number;
  onTimeRepaymentBps: number;
  totalRepaidUsdc: number;
  currentOutstandingDebtUsdc: number;
  currentDebtDueAt: number;
};

export type ConfidentialInferenceResult = {
  riskScore: number;
  approvedMultiple: number;
  rationale: string;
};

export type UnderwritingReport = {
  vendor: `0x${string}`;
  cap: bigint;
  expiry: bigint;
  inference: ConfidentialInferenceResult;
  encodedPayload: `0x${string}`;
};

const USDC = 1_000_000n;
const MAX_MULTIPLE = 3;
const DEFAULT_NO_HISTORY_BPS = 4_000;
const REPORT_TTL_SECONDS = 7n * 24n * 60n * 60n;

export function deriveConservativeCap(input: FinancialInputs, inference: ConfidentialInferenceResult) {
  const sanitizedMultiple = Math.max(0, Math.min(MAX_MULTIPLE, inference.approvedMultiple));
  const marginAdjustedMrr =
    (input.monthlyRecurringRevenueUsd * Math.max(0, input.grossMarginBps)) / 10_000;
  const burnCoveragePenalty = input.monthlyBurnUsd > input.cashBalanceUsd ? 0.5 : 1;
  const delinquencyPenalty = input.delinquencyRateBps > 1_000 ? 0.5 : 1;
  const riskPenalty = inference.riskScore > 70 ? 0.5 : 1;

  const capUsd =
    marginAdjustedMrr * sanitizedMultiple * burnCoveragePenalty * delinquencyPenalty * riskPenalty;

  return BigInt(Math.floor(capUsd)) * USDC;
}

export function hasPlatformHistory(input: FinancialInputs) {
  const history = input.platformTrackRecord;
  if (!history) return false;

  return history.repaymentCount > 0;
}

export function deriveNoHistoryCap(input: FinancialInputs) {
  const allocationUnits = BigInt(Math.floor(Math.max(0, input.currentCreditAllocationUsdc) * 1_000_000));
  return allocationUnits * BigInt(DEFAULT_NO_HISTORY_BPS) / 10_000n;
}

export function deriveCap(input: FinancialInputs, inference: ConfidentialInferenceResult) {
  if (!hasPlatformHistory(input)) {
    return deriveNoHistoryCap(input);
  }

  const inferredCap = deriveConservativeCap(input, inference);
  const allocationCap = BigInt(Math.floor(Math.max(0, input.currentCreditAllocationUsdc) * 1_000_000));
  const platformCap = derivePlatformTrackRecordCap(input);
  const smallerCap = inferredCap < platformCap ? inferredCap : platformCap;
  return smallerCap > allocationCap ? allocationCap : smallerCap;
}

export function derivePlatformTrackRecordCap(input: FinancialInputs) {
  const history = input.platformTrackRecord;
  if (!history || history.repaymentCount === 0) return deriveNoHistoryCap(input);

  const allocationUnits = BigInt(Math.floor(Math.max(0, input.currentCreditAllocationUsdc) * 1_000_000));
  const onTimeBps = Math.max(0, Math.min(10_000, history.onTimeRepaymentBps));
  const latePenaltyBps = Math.min(3_000, history.lateRepaymentCount * 1_000);
  const outstandingPenaltyBps = history.currentOutstandingDebtUsdc > 0 ? 1_000 : 0;
  const trackRecordBps = Math.max(1_000, Math.min(10_000, 4_000 + onTimeBps / 2 - latePenaltyBps - outstandingPenaltyBps));

  return allocationUnits * BigInt(Math.floor(trackRecordBps)) / 10_000n;
}

export function encodeCreditCapReport(
  vendor: `0x${string}`,
  cap: bigint,
  expiry: bigint,
): `0x${string}` {
  return encodeAbiParameters(parseAbiParameters("address vendor, uint256 cap, uint64 expiry"), [
    vendor,
    cap,
    expiry,
  ]);
}

export async function underwriteVendor(
  input: FinancialInputs,
  confidentialInfer: (input: FinancialInputs) => Promise<ConfidentialInferenceResult>,
  nowSeconds: bigint,
): Promise<UnderwritingReport> {
  const inference = await confidentialInfer(input);
  const cap = deriveCap(input, inference);
  const expiry = nowSeconds + REPORT_TTL_SECONDS;

  return {
    vendor: input.vendor,
    cap,
    expiry,
    inference,
    encodedPayload: encodeCreditCapReport(input.vendor, cap, expiry),
  };
}

export async function workflow(runtime: {
  now: () => Promise<number> | number;
  secrets: { get: (name: string) => Promise<string> | string };
  confidentialHttp: {
    post: (url: string, init: { headers: Record<string, string>; body: unknown }) => Promise<{
      body: ConfidentialInferenceResult;
    }>;
  };
  evm: {
    writeReport: (args: {
      chainId: number;
      receiver: `0x${string}`;
      report: `0x${string}`;
    }) => Promise<unknown>;
  };
}, input: FinancialInputs) {
  const now = BigInt(await runtime.now());
  const endpoint = await runtime.secrets.get("CONFIDENTIAL_AI_ENDPOINT");
  const apiKey = await runtime.secrets.get("CONFIDENTIAL_AI_API_KEY");

  const report = await underwriteVendor(
    input,
    async (financials) => {
      const response = await runtime.confidentialHttp.post(endpoint, {
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: {
          task: "underwrite_usdc_credit_cap",
          financials,
          policy: {
            noPlatformHistoryCapBps: DEFAULT_NO_HISTORY_BPS,
            currentAllocationUsdc: financials.currentCreditAllocationUsdc,
            platformTrackRecord: financials.platformTrackRecord ?? null,
          },
        },
      });

      return response.body;
    },
    now,
  );

  await runtime.evm.writeReport({
    chainId: Number(process.env.ARC_CHAIN_ID ?? "5042002"),
    receiver: process.env.STAKE_AND_ADVANCE_ADDRESS as `0x${string}`,
    report: report.encodedPayload,
  });

  return report;
}
