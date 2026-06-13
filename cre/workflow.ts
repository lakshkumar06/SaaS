import {
  bytesToHex,
  ConsensusAggregationByFields,
  cre,
  getNetwork,
  type HTTPSendRequester,
  identical,
  json,
  median,
  ok,
  prepareReportRequest,
  TxStatus,
  type HTTPPayload,
  type Runtime,
} from "@chainlink/cre-sdk";
import { z } from "zod";

import {
  type ConfidentialInferenceResult,
  type FinancialInputs,
  underwriteVendor,
} from "./src/creditUnderwriting";

const platformTrackRecordSchema = z.object({
  drawdownCount: z.number(),
  repaymentCount: z.number(),
  onTimeRepaymentCount: z.number(),
  lateRepaymentCount: z.number(),
  onTimeRepaymentBps: z.number(),
  totalRepaidUsdc: z.number(),
  currentOutstandingDebtUsdc: z.number(),
  currentDebtDueAt: z.number(),
});

const financialInputsSchema = z.object({
  vendor: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  currentDepositedPrincipalUsdc: z.number(),
  monthlyRecurringRevenueUsd: z.number(),
  grossMarginBps: z.number(),
  cashBalanceUsd: z.number(),
  monthlyBurnUsd: z.number(),
  delinquencyRateBps: z.number(),
  platformTrackRecord: platformTrackRecordSchema.nullish(),
});

export const configSchema = z.object({
  inferenceUrl: z.string().url(),
  evm: z.object({
    chainSelectorName: z.string(),
    receiver: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    gasLimit: z.string(),
  }),
});

export type WorkflowConfig = z.infer<typeof configSchema>;

function decodePayload(payload: HTTPPayload): FinancialInputs {
  const inputText = Buffer.from(payload.input).toString("utf8");
  return financialInputsSchema.parse(JSON.parse(inputText)) as FinancialInputs;
}

function fetchInference(
  sendRequester: HTTPSendRequester,
  inferenceUrl: string,
  financials: FinancialInputs,
): ConfidentialInferenceResult {
  const response = sendRequester.sendRequest({
    url: inferenceUrl,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: Buffer.from(JSON.stringify({ financials })).toString("base64"),
  }).result();

  if (!ok(response)) {
    throw new Error(`Inference request failed with status ${response.statusCode}`);
  }

  return json(response) as ConfidentialInferenceResult;
}

async function onHttpTrigger(runtime: Runtime<WorkflowConfig>, payload: HTTPPayload) {
  const financials = decodePayload(payload);
  const httpClient = new cre.capabilities.HTTPClient();

  const inference = httpClient.sendRequest(
    runtime,
    fetchInference,
    ConsensusAggregationByFields<ConfidentialInferenceResult>({
      riskScore: median,
      approvedMultiple: median,
      rationale: identical,
    }),
  )(runtime.config.inferenceUrl, financials).result();

  const reportPayload = await underwriteVendor(
    financials,
    async () => inference,
    BigInt(Math.floor(runtime.now().getTime() / 1000)),
  );

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.evm.chainSelectorName,
    isTestnet: true,
  });
  if (!network) {
    throw new Error(`Unsupported network ${runtime.config.evm.chainSelectorName}`);
  }

  const report = runtime.report(prepareReportRequest(reportPayload.encodedPayload)).result();
  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const writeResult = evmClient.writeReport(runtime, {
    receiver: runtime.config.evm.receiver,
    report,
    gasConfig: { gasLimit: runtime.config.evm.gasLimit },
  }).result();

  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `writeReport failed: ${writeResult.errorMessage || writeResult.txStatus}`,
    );
  }

  if (!writeResult.txHash) {
    throw new Error("writeReport succeeded without a transaction hash");
  }

  const txHash = bytesToHex(writeResult.txHash);
  runtime.log(
    JSON.stringify(
      {
        vendor: reportPayload.vendor,
        cap: reportPayload.cap.toString(),
        expiry: reportPayload.expiry.toString(),
        creditAllocationBps: reportPayload.creditAllocationBps,
        txHash,
      },
      null,
      2,
    ),
  );

  return {
    vendor: reportPayload.vendor,
    cap: reportPayload.cap.toString(),
    expiry: reportPayload.expiry.toString(),
    creditAllocationBps: reportPayload.creditAllocationBps,
    txHash,
    inference,
  };
}

export function initWorkflow(_config: WorkflowConfig) {
  const httpTrigger = new cre.capabilities.HTTPCapability();

  return [
    cre.handler(
      httpTrigger.trigger({
        authorizedKeys: [],
      }),
      onHttpTrigger,
    ),
  ];
}
