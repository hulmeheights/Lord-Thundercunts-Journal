"use client";

import { LineChart } from "@/components/m/LineChart";

/** Win rate after every trade: all-time (solid) and the last 20 trades (dashed). */
export function WinRateChart({ cumulative, rolling, labels }: { cumulative: number[]; rolling: number[]; labels: string[] }) {
  return (
    <LineChart
      height={200}
      zero={false}
      labels={labels}
      format={(v) => `${v.toFixed(0)}%`}
      series={[
        { values: cumulative, tone: "pos", label: "All trades" },
        { values: rolling, tone: "gold", dashed: true, label: "Last 20" },
      ]}
    />
  );
}
