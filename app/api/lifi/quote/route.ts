import { NextRequest, NextResponse } from "next/server";

import { getIntakeQuote } from "../../../lib/lifi";

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams;
    const quote = await getIntakeQuote({
      fromChain: requiredNumber(search, "fromChain"),
      fromToken: required(search, "fromToken"),
      fromAmount: required(search, "fromAmount"),
      fromAddress: required(search, "fromAddress"),
      user: required(search, "user"),
      slippage: optionalNumber(search, "slippage"),
    });

    return NextResponse.json(quote, { status: quote.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 400 },
    );
  }
}

function required(search: URLSearchParams, key: string) {
  const value = search.get(key);
  if (!value) throw new Error(`missing ${key}`);
  return value;
}

function requiredNumber(search: URLSearchParams, key: string) {
  const value = Number(required(search, key));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`invalid ${key}`);
  return value;
}

function optionalNumber(search: URLSearchParams, key: string) {
  const raw = search.get(key);
  if (!raw) return undefined;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`invalid ${key}`);
  return value;
}
