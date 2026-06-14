export type ChartCoord = readonly [number, number];

export function buildSmoothPath(coords: ChartCoord[], tension = 0.38) {
  if (coords.length === 0) return "";
  if (coords.length === 1) {
    const [x, y] = coords[0];
    return `M ${x} ${y}`;
  }

  let path = `M ${coords[0][0]} ${coords[0][1]}`;

  for (let index = 0; index < coords.length - 1; index += 1) {
    const previous = coords[Math.max(index - 1, 0)];
    const current = coords[index];
    const next = coords[index + 1];
    const after = coords[Math.min(index + 2, coords.length - 1)];

    const control1x = current[0] + (next[0] - previous[0]) * tension;
    const control1y = current[1] + (next[1] - previous[1]) * tension;
    const control2x = next[0] - (after[0] - current[0]) * tension;
    const control2y = next[1] - (after[1] - current[1]) * tension;

    path += ` C ${control1x} ${control1y}, ${control2x} ${control2y}, ${next[0]} ${next[1]}`;
  }

  return path;
}

export function densifyPoints(points: number[], targetCount = 12) {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: targetCount }, () => points[0]);
  if (points.length >= targetCount) return points.slice(-targetCount);

  const output: number[] = [];
  const lastIndex = points.length - 1;

  for (let index = 0; index < targetCount; index += 1) {
    const position = (index / (targetCount - 1)) * lastIndex;
    const left = Math.floor(position);
    const right = Math.min(left + 1, lastIndex);
    const weight = position - left;
    output.push(points[left] * (1 - weight) + points[right] * weight);
  }

  return output;
}

export function buildChartCoords(
  points: number[],
  width: number,
  height: number,
  padding = { top: 24, bottom: 20, sides: 8 },
) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const peak = Math.max(max, 1);
  const floor = Math.min(min, peak);
  const verticalPadding = Math.max(peak * 0.22, peak === min ? peak * 0.35 : (peak - floor) * 0.5, 0.75);
  const rangeMin = Math.max(0, floor - verticalPadding * 0.35);
  const rangeMax = peak + verticalPadding;
  const spread = Math.max(rangeMax - rangeMin, 0.001);
  const chartHeight = height - padding.top - padding.bottom;
  const chartWidth = width - padding.sides * 2;

  const coords = points.map((point, index) => {
    const x = padding.sides + (index / Math.max(points.length - 1, 1)) * chartWidth;
    const normalized = (point - rangeMin) / spread;
    const y = padding.top + chartHeight - normalized * chartHeight;
    return [x, y] as const;
  });

  return { coords, rangeMin, rangeMax };
}
