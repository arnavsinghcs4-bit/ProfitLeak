import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { LossCause } from "@/types/api";
import { fmtCurrency, fmtPct } from "@/lib/format";

const CAUSE_COLORS: Record<string, string> = {
  Both: "#E5654F",
  "Shipping-driven": "#D9A441",
  "Discount-driven": "#D9A441",
  "Cost-driven": "#5a7060",
};

interface LossCauseChartProps {
  causes: LossCause[];
  onCauseClick?: (cause: string) => void;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as LossCause;
  return (
    <div className="bg-elevated border border-border rounded px-3 py-2.5 text-xs shadow-xl">
      <p className="text-ink font-medium mb-1">{d.cause}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-ink-faint">Orders</span>
        <span className="tabular-nums text-ink">{d.count.toLocaleString()}</span>
        <span className="text-ink-faint">Share</span>
        <span className="tabular-nums text-ink">{fmtPct(d.share)}</span>
        <span className="text-ink-faint">Total loss</span>
        <span className="tabular-nums text-loss">{fmtCurrency(d.total_loss, 2)}</span>
      </div>
    </div>
  );
};

export function LossCauseChart({ causes, onCauseClick }: LossCauseChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={causes}
        layout="vertical"
        margin={{ top: 4, right: 60, left: 4, bottom: 4 }}
        onClick={onCauseClick ? (e) => {
          const name = e?.activePayload?.[0]?.payload?.cause;
          if (name) onCauseClick(name);
        } : undefined}
      >
        <XAxis
          type="number"
          tick={{ fill: "#6B736A", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
          tickLine={false}
          axisLine={{ stroke: "#2B312B" }}
          tickFormatter={(v) => v.toLocaleString()}
        />
        <YAxis
          type="category"
          dataKey="cause"
          tick={{ fill: "#969D93", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(199,243,107,0.05)" }} />
        <Bar dataKey="count" name="Orders" radius={[0, 3, 3, 0]} maxBarSize={24}>
          {causes.map((c) => (
            <Cell
              key={c.cause}
              fill={CAUSE_COLORS[c.cause] ?? "#5a7060"}
              fillOpacity={0.8}
              style={onCauseClick ? { cursor: "pointer" } : {}}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
