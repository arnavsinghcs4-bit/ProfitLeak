import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { DiscountBandStats } from "@/types/api";
import { fmtCurrency, fmtPct, fmtCount } from "@/lib/format";

interface DiscountBandsChartProps {
  bands: DiscountBandStats[];
  breakevenDiscount: number | null;
  metric?: "net_profit" | "profit_margin" | "orders";
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as DiscountBandStats;
  return (
    <div className="bg-elevated border border-border rounded px-3 py-2.5 text-xs shadow-xl">
      <p className="text-ink font-medium mb-1.5">{d.band}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-ink-faint">Orders</span>
        <span className="tabular-nums text-ink">{fmtCount(d.orders)}</span>
        <span className="text-ink-faint">Net profit</span>
        <span className={["tabular-nums", d.net_profit < 0 ? "text-loss" : "text-gain"].join(" ")}>
          {fmtCurrency(d.net_profit)}
        </span>
        <span className="text-ink-faint">Agg. margin</span>
        <span className={["tabular-nums", d.profit_margin < 0 ? "text-loss" : "text-gain"].join(" ")}>
          {fmtPct(d.profit_margin)}
        </span>
        <span className="text-ink-faint">Avg margin</span>
        <span className="tabular-nums text-ink">{fmtPct(d.avg_order_margin)}</span>
        <span className="text-ink-faint">Loss orders</span>
        <span className="tabular-nums text-loss">{fmtCount(d.loss_orders)}</span>
      </div>
    </div>
  );
};

export function DiscountBandsChart({ bands, breakevenDiscount, metric = "net_profit" }: DiscountBandsChartProps) {
  const dataKey = metric;
  const yFormatter = metric === "orders" ? fmtCount : metric === "profit_margin" ? (v: number) => fmtPct(v) : fmtCurrency;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={bands} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <CartesianGrid stroke="#2B312B" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="band"
          tick={{ fill: "#6B736A", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
          tickLine={false}
          axisLine={{ stroke: "#2B312B" }}
        />
        <YAxis
          tick={{ fill: "#6B736A", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => yFormatter(v)}
          width={68}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(199,243,107,0.05)" }} />
        <ReferenceLine y={0} stroke="#2B312B" strokeWidth={1.5} />
        <Bar dataKey={dataKey} radius={[3, 3, 0, 0]} maxBarSize={40}>
          {bands.map((b) => {
            const val = metric === "profit_margin" ? b.profit_margin : metric === "orders" ? b.orders : b.net_profit;
            return <Cell key={b.band} fill={val < 0 ? "#E5654F" : "#5FB87A"} fillOpacity={0.75} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
