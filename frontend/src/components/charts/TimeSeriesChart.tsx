import React, { useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TimeSeriesPoint } from "@/types/api";
import { fmtCurrency, fmtCount } from "@/lib/format";

interface TimeSeriesChartProps {
  points: TimeSeriesPoint[];
  granularity: "month" | "quarter" | "year";
  onGranularityChange: (g: "month" | "quarter" | "year") => void;
}

const COLORS = {
  gross_sales: "#3d4b3d",
  net_revenue: "#5a7060",
  net_profit: "#C7F36B",
};

function formatPeriod(period: string, granularity: string): string {
  try {
    if (granularity === "year") return period;
    if (granularity === "quarter") return period; // e.g. "2023Q1"
    // Month: "2023-01" → "Jan '23"
    const [year, month] = period.split("-");
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${monthNames[parseInt(month) - 1]} '${year.slice(2)}`;
  } catch {
    return period;
  }
}

const CustomTooltip = ({ active, payload, label, granularity }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-elevated border border-border rounded px-3 py-2.5 text-xs shadow-xl">
      <p className="font-mono text-ink-muted mb-2">{formatPeriod(label, granularity)}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }} className="capitalize">
            {p.dataKey.replace(/_/g, " ")}
          </span>
          <span className="tabular-nums text-ink">
            {p.dataKey === "orders" || p.dataKey === "loss_orders"
              ? fmtCount(p.value)
              : fmtCurrency(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

export function TimeSeriesChart({ points, granularity, onGranularityChange }: TimeSeriesChartProps) {
  const data = points.map((p) => ({
    ...p,
    period_label: formatPeriod(p.period, granularity),
  }));

  return (
    <div>
      <div className="flex justify-end gap-1 mb-4">
        {(["month", "quarter", "year"] as const).map((g) => (
          <button
            key={g}
            onClick={() => onGranularityChange(g)}
            className={[
              "px-2.5 py-1 text-2xs font-mono rounded border transition-colors",
              granularity === g
                ? "bg-accent/20 border-accent/50 text-accent"
                : "border-border text-ink-faint hover:text-ink-muted hover:border-border",
            ].join(" ")}
          >
            {g.charAt(0).toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <CartesianGrid stroke="#2B312B" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="period_label"
            tick={{ fill: "#6B736A", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
            tickLine={false}
            axisLine={{ stroke: "#2B312B" }}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="revenue"
            tick={{ fill: "#6B736A", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => fmtCurrency(v)}
            width={72}
          />
          <Tooltip content={<CustomTooltip granularity={granularity} />} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#969D93", fontFamily: "JetBrains Mono, monospace" }}
          />
          <Bar yAxisId="revenue" dataKey="gross_sales" name="Gross sales" fill={COLORS.gross_sales} radius={[2, 2, 0, 0]} maxBarSize={32} />
          <Bar yAxisId="revenue" dataKey="net_revenue" name="Net revenue" fill={COLORS.net_revenue} radius={[2, 2, 0, 0]} maxBarSize={32} />
          <Line
            yAxisId="revenue"
            type="monotone"
            dataKey="net_profit"
            name="Net profit"
            stroke={COLORS.net_profit}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: COLORS.net_profit }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
