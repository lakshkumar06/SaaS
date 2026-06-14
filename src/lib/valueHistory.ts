import { formatUnits, type Address } from "viem";

import type { PoolActivity } from "./poolActivity";
import { USDC_DECIMALS } from "./format";

const STORAGE_PREFIX = "stake-advance-value-history";
const MAX_POINTS = 32;
export const CHART_POINT_COUNT = 12;

function storageKey(poolAddress: string) {
  return `${STORAGE_PREFIX}:${poolAddress.toLowerCase()}`;
}

export function loadValueHistory(poolAddress: string): number[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = sessionStorage.getItem(storageKey(poolAddress));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  } catch {
    return [];
  }
}

export function saveValueHistory(poolAddress: string, values: number[]) {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(storageKey(poolAddress), JSON.stringify(values.slice(-MAX_POINTS)));
  } catch {
    // ignore quota errors
  }
}

export function appendValueHistory(poolAddress: string, value: number): number[] {
  const history = loadValueHistory(poolAddress);
  const last = history[history.length - 1];

  if (last === undefined || Math.abs(last - value) > 0.000001) {
    history.push(value);
  }

  const trimmed = history.slice(-MAX_POINTS);
  saveValueHistory(poolAddress, trimmed);
  return trimmed;
}

function activityValueDelta(activity: PoolActivity) {
  if (activity.amount === undefined) return null;

  const amount = Number(formatUnits(activity.amount, USDC_DECIMALS));
  switch (activity.kind) {
    case "deposit":
      return amount;
    case "redeem":
      return -amount;
    case "default":
      return -amount;
    default:
      return null;
  }
}

export function buildValueHistoryFromActivity(
  activities: PoolActivity[],
  currentValue: number,
  options?: { actor?: Address; memberOnly?: boolean },
  count = CHART_POINT_COUNT,
) {
  const chronological = [...activities]
    .filter((activity) => activity.timestamp > 0)
    .sort((left, right) => left.timestamp - right.timestamp);

  const relevant = options?.memberOnly && options.actor
    ? chronological.filter(
        (activity) =>
          activity.actor?.toLowerCase() === options.actor?.toLowerCase() &&
          (activity.kind === "deposit" || activity.kind === "redeem"),
      )
    : chronological.filter((activity) => activity.kind === "deposit" || activity.kind === "redeem" || activity.kind === "default");

  const series: number[] = [];
  let running = 0;

  for (const activity of relevant) {
    const delta = activityValueDelta(activity);
    if (delta === null) continue;
    running = Math.max(0, running + delta);
    series.push(running);
  }

  return buildChartPoints(series, currentValue, count);
}

export function buildChartPoints(history: number[], currentValue: number, count = CHART_POINT_COUNT) {
  const series =
    history.length > 0 && history[history.length - 1] === currentValue
      ? history
      : [...history, currentValue];

  if (series.length >= count) {
    return series.slice(-count);
  }

  const anchor = series[series.length - 1] ?? currentValue;
  const start = series[0] ?? Math.max(anchor * 0.72, 0);

  return Array.from({ length: count }, (_, index) => {
    const historyIndex = series.length - count + index;
    if (historyIndex >= 0) return series[historyIndex];

    const progress = index / Math.max(count - 1, 1);
    const eased = 1 - (1 - progress) ** 1.6;
    return start + (anchor - start) * eased;
  });
}
