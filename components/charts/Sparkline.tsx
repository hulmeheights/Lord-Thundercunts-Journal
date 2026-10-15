import { smoothPath, niceExtent } from "./path";

export function Sparkline({ values, width = 120, height = 36, color }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const [lo, hi] = niceExtent(values, true);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, 2 + (1 - (v - lo) / (hi - lo)) * (height - 4)] as [number, number]);
  const c = color ?? (values[values.length - 1]! >= 0 ? "#30d158" : "#ff453a");
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={smoothPath(pts)} fill="none" stroke={c} strokeWidth={1.75} strokeLinecap="round" />
    </svg>
  );
}
