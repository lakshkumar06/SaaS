import { formatUnits } from "viem";

export const USDC_DECIMALS = 6;
export const NAV_DECIMALS = 18;

export function toUsdc(value: bigint, decimals = USDC_DECIMALS) {
  return Number(formatUnits(value, decimals));
}

export function fmtUsd(value: bigint, decimals = USDC_DECIMALS) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(toUsdc(value, decimals));
}

export function fmtUsdPrecise(value: bigint, decimals = USDC_DECIMALS) {
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction ? `$${whole}.${trimmedFraction}` : `$${whole}`;
}

export function fmtTokenPrecise(value: bigint, decimals = USDC_DECIMALS, symbol = "USDC") {
  return `${formatUnits(value, decimals)} ${symbol}`;
}

export function fmtUsdAdaptive(value: bigint, decimals = USDC_DECIMALS) {
  return value !== 0n && value < 1_000_000n ? fmtUsdPrecise(value, decimals) : fmtUsd(value, decimals);
}

export function fmtCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function fmtPct(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}

export function fmtDate(timestamp: bigint) {
  if (timestamp === 0n) return "Not set";
  return new Date(Number(timestamp) * 1000).toLocaleString();
}

export function fmtAddress(address?: string) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected";
}

export function fmtRelativeTime(timestampMs: number) {
  if (!timestampMs) return "Unknown time";

  const diff = Date.now() - timestampMs;
  if (diff < 45_000) return "Just now";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))}h ago`;
  if (diff < 604_800_000) return `${Math.max(1, Math.floor(diff / 86_400_000))}d ago`;

  return new Date(timestampMs).toLocaleDateString();
}
