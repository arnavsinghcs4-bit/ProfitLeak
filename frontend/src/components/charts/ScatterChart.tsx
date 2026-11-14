import React from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Line,
} from "recharts";
import type { ScatterPoint } from "@/types/api";
import { fmtPct, fmtCurrency } from "@/lib/format";

interface DiscountScatterChartProps {
  points: ScatterPoint[];
  breakevenDiscount: number | null;
  fitSlope: number | null;
  fitIntercept: number | null;
  rSquared: number | null;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ScatterPoint;
  return (
    <div className="bg-elevated border border-border rounded px-3 py-2.5 text-xs shadow-xl">
      <p className="text-ink-faint font-mono mb-1">Order</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-ink-faint">Discount</span>
        <span className="tabular-nums text-ink">{fmtPct(d.discount)}</span>
        <span className="text-ink-faint">Margin</span>
        <span className={["tabular-nums", d.profit_margin < 0 ? "text-loss" : "text-gain"].join(" ")}>
          {fmtPct(d.profit_margin)}
        </span>
        <span className="text-ink-faint">Net rev.</span>
        <span className="tabular-nums text-ink">{fmtCurrency(d.net_revenue, 2)}</span>
      </div>
    </div>
  );
};

export function DiscountScatterChart({
  points,
  breakevenDiscount,
  fitSlope,
  fitIntercept,
  rSquared,
}: DiscountScatterChartProps) {
  const profitable = points.filter((p) => !p.is_loss);
  const loss = points.filter((p) => p.is_loss);

  // Generate regression line points if available
  const regressionLine =
    fitSlope != null && fitIntercept != null
      ? [
          { discount: 0, margin: fitIntercept },
          { discount: 1, margin: fitSlope + fitIntercept },
        ]
      : null;

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#2B312B" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="discount"
            name="Discount"
            domain={[0, 1]}
            tickFormatter={(v) => fmtPct(v, 0)}
            tick={{ fill: "#6B736A", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
            tickLine={false}
            axisLine={{ stroke: "#2B312B" }}
            label={{ value: "Discount %", position: "insideBottomRight", offset: -4, fill: "#6B736A", fontSize: 10 }}
          />
          <YAxis
            type="number"
            dataKey="profit_margin"
            name="Margin"
            tickFormatter={(v) => fmtPct(v, 0)}
            tick={{ fill: "#6B736A", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
            tickLine={false}
            axisLine={false}
            width={52}
            label={{ value: "Margin %", angle: -90, position: "insideLeft", fill: "#6B736A", fontSize: 10 }}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Zero margin reference */}
          <ReferenceLine
            y={0}
            yAxisId={0}
            stroke="#2B312B"
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />

          {/* Break-even line */}
          {breakevenDiscount != null && (
            <ReferenceLine
              x={breakevenDiscount}
              yAxisId={0}
              stroke="#C7F36B"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              label={{
                value: `Breakeven ~${fmtPct(breakevenDiscount, 0)}`,
                position: "top",
                fill: "#C7F36B",
                fontSize: 10,
                fontFamily: "JetBrains Mono, monospace",
              }}
            />
          )}

          <Scatter name="Profitable" data={profitable} fill="#5FB87A" fillOpacity={0.4} r={2} />
          <Scatter name="Loss" data={loss} fill="#E5654F" fillOpacity={0.5} r={2.5} />
        </ScatterChart>
      </ResponsiveContainer>

      {rSquared != null && (
        <p className="text-2xs text-ink-faint font-mono mt-2 text-right">
          Linear regression R² = {rSquared.toFixed(3)} (n = {points.length.toLocaleString()})
          {" "}· Breakeven is an estimate from the fitted line, not a per-order guarantee.
        </p>
      )}
    </div>
  );
}
