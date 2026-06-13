type RequestLike = AsyncIterable<Uint8Array> & {
  method?: string;
  url?: string;
};

type ResponseLike = {
  writeHead: (statusCode: number, headers: Record<string, string>) => void;
  end: (body?: string) => void;
};

type FinancialInputs = {
  vendor: `0x${string}`;
  currentDepositedPrincipalUsdc: number;
  monthlyRecurringRevenueUsd: number;
  grossMarginBps: number;
  cashBalanceUsd: number;
  monthlyBurnUsd: number;
  delinquencyRateBps: number;
  platformTrackRecord?: {
    drawdownCount: number;
    repaymentCount: number;
    onTimeRepaymentCount: number;
    lateRepaymentCount: number;
    onTimeRepaymentBps: number;
    totalRepaidUsdc: number;
    currentOutstandingDebtUsdc: number;
    currentDebtDueAt: number;
  } | null;
};

type InferenceResponse = {
  riskScore: number;
  approvedMultiple: number;
  rationale: string;
};

function send(res: ResponseLike, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: RequestLike): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function infer(financials: FinancialInputs): InferenceResponse {
  const history = financials.platformTrackRecord;
  const onTimeBps = history?.onTimeRepaymentBps ?? 0;
  const lateCount = history?.lateRepaymentCount ?? 0;
  const outstandingPenalty = (history?.currentOutstandingDebtUsdc ?? 0) > 0 ? 12 : 0;
  const burnPenalty = financials.monthlyBurnUsd > financials.cashBalanceUsd ? 18 : 0;
  const delinquencyPenalty = Math.min(20, Math.floor(financials.delinquencyRateBps / 50));
  const marginBonus = Math.min(18, Math.floor(financials.grossMarginBps / 500));
  const revenueBonus = Math.min(10, Math.floor(financials.monthlyRecurringRevenueUsd / 50000));
  const repaymentBonus = Math.min(10, Math.floor(onTimeBps / 1000));

  const riskScore = Math.max(
    5,
    Math.min(
      95,
      55 - marginBonus - revenueBonus - repaymentBonus + lateCount * 8 + outstandingPenalty
        + burnPenalty + delinquencyPenalty,
    ),
  );

  const approvedMultiple = Number(
    Math.max(0.5, Math.min(3, 2.6 - riskScore / 40 + marginBonus / 20)).toFixed(2),
  );

  return {
    riskScore,
    approvedMultiple,
    rationale:
      riskScore <= 35
        ? "Low-risk vendor with strong repayment quality and healthy unit economics."
        : riskScore <= 60
          ? "Moderate risk due to mixed repayment history or thinner cash coverage."
          : "Elevated risk driven by weaker repayment quality, burn pressure, or delinquency.",
  };
}

async function main() {
  const port = Number(process.env.CRE_INFERENCE_PORT ?? 8790);
  const nodeHttp: any = await import("node:http");
  const server = nodeHttp.createServer(async (req: RequestLike, res: ResponseLike) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        return send(res, 200, { ok: true });
      }

      if (req.method === "POST" && req.url === "/infer") {
        const body = await readJson(req);
        const financials = body.financials as FinancialInputs | undefined;
        if (!financials) return send(res, 400, { error: "missing financials" });
        return send(res, 200, infer(financials));
      }

      return send(res, 404, { error: "not found" });
    } catch (error) {
      return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.listen(port, () => {
    console.log(`[cre-inference] listening on http://127.0.0.1:${port}`);
  });
}

main();
