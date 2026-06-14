import { formatUnits } from "viem";

export function toUsdc(value: bigint, decimals = 18) {
  return Number(formatUnits(value, decimals));
}

export function fmtUsd(value: bigint, decimals = 18) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(toUsdc(value, decimals));
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
