import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/context/SessionContext";
import { getDiscountBands, getScatter } from "@/lib/api";
import type { DiscountBandStats, ScatterResponse } from "@/types/api";
import { fmtCurrency, fmtPct, fmtCount, fmtProfit } from "@/lib/format";
import {
  PageHeader,
  SectionHeader,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/ui";
import { DiscountBandsChart } from "@/components/charts/DiscountBandsChart";
import { DiscountScatterChart } from "@/components/charts/ScatterChart";
import { Loader2 } from "lucide-react";
import clsx from "clsx";

type BandMetric = "net_profit" | "profit_margin" | "orders";

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-border rounded-lg p-5 ${className}`}>
      {children}
    </div>
  );
}

export default function DiscountAnalysis() {
  const { sessionId, meta, summary } = useSession();
  const navigate = useNavigate();

  const [bands, setBands] = useState<DiscountBandStats[] | null>(null);
  const [scatter, setScatter] = useState<ScatterResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<BandMetric>("net_profit");

  const analyzed = meta?.status === "analyzed";
  const s = summary?.summary;

  useEffect(() => {
    if (!sessionId || !analyzed) return;
    setLoading(true);
    Promise.all([
      getDiscountBands(sessionId),
      getScatter(sessionId),
    ])
      .then(([b, sc]) => {
        setBands(b.bands);
        setScatter(sc);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [sessionId, analyzed]);

  if (!sessionId || !meta) {
    return (
      <div className="px-6 lg:px-8 py-8">
        <PageHeader title="Discount Analysis" />
        <EmptyState title="No dataset loaded" action={<button onClick={() => navigate("/data")} className="text-xs text-accent hover:underline">Go to Data Sources</button>} />
      </div>
    );
  }
  if (!analyzed) {
    return (
      <div className="px-6 lg:px-8 py-8">
        <PageHeader title="Discount Analysis" />
        <EmptyState title="Analysis not run" description="Run the analysis from the Overview page." />
      </div>
    );
  }

  return (
    <div className="px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        title="Discount Analysis"
        description="Understand how discounting affects profitability. The breakeven estimate is derived from a linear regression on the dataset — it is statistical guidance, not a per-order guarantee."
      />

      {/* Breakeven summary */}
      {s?.breakeven_discount != null && (
        <div className="bg-surface border border-border rounded-lg p-5 flex flex-wrap gap-8">
          <div>
            <p className="text-2xs text-ink-faint font-mono uppercase tracking-wider mb-1">Estimated breakeven discount</p>
            <p className="text-3xl font-semibold text-accent tabular-nums">{fmtPct(s.breakeven_discount)}</p>
            <p className="text-xs text-ink-faint mt-1 max-w-xs">Orders discounted above this level tend toward unprofitability on average, based on a linear regression (not a causal threshold).</p>
          </div>
          {s.r_squared != null && (
            <div>
              <p className="text-2xs text-ink-faint font-mono uppercase tracking-wider mb-1">Regression R²</p>
              <p className="text-2xl font-semibold text-ink-muted tabular-nums">{s.r_squared.toFixed(3)}</p>
              <p className="text-xs text-ink-faint mt-1">Goodness-of-fit of the discount-to-margin regression. Values near 1 indicate a strong linear relationship.</p>
            </div>
          )}
          {s.fit_n != null && (
            <div>
              <p className="text-2xs text-ink-faint font-mono uppercase tracking-wider mb-1">Sample size</p>
              <p className="text-2xl font-semibold text-ink-muted tabular-nums">{fmtCount(s.fit_n)}</p>
              <p className="text-xs text-ink-faint mt-1">Orders used in regression.</p>
            </div>
          )}
        </div>
      )}

      {error && <ErrorState message={error} />}
      {loading && <LoadingSkeleton rows={4} cols={5} />}

      {!loading && (
        <>
          {/* Bands chart */}
          <SectionCard>
            <SectionHeader
              title="Profitability by discount band"
              description="Configured discount bands from config.yaml. Each bar shows all orders in that discount range."
              actions={
                <div className="flex gap-1">
                  {(["net_profit", "profit_margin", "orders"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMetric(m)}
                      className={[
                        "px-2 py-1 text-2xs font-mono rounded border transition-colors",
                        metric === m
                          ? "bg-accent/20 border-accent/50 text-accent"
                          : "border-border text-ink-faint hover:text-ink-muted",
                      ].join(" ")}
                    >
                      {m === "net_profit" ? "Net profit" : m === "profit_margin" ? "Margin" : "Orders"}
                    </button>
                  ))}
                </div>
              }
            />
            {bands && bands.length > 0 ? (
              <DiscountBandsChart
                bands={bands}
                breakevenDiscount={s?.breakeven_discount ?? null}
                metric={metric}
              />
            ) : (
              <EmptyState title="No discount band data" description="Add a discount column to your dataset." />
            )}
          </SectionCard>

          {/* Bands detail table */}
          {bands && bands.length > 0 && (
            <SectionCard>
              <SectionHeader
                title="Discount band detail"
                description="Aggregate margin = sum(net_profit) / sum(net_revenue) for the band. Avg. margin = mean of row-level margins."
              />
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      {["Band", "Orders", "Gross Sales", "Net Revenue", "Net Profit", "Agg. Margin", "Avg. Margin", "Loss Orders"].map((h) => (
                        <th key={h} className={clsx("px-3 py-2 text-2xs font-mono uppercase tracking-widest text-ink-faint", h === "Band" ? "text-left" : "text-right")}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bands.map((b) => (
                      <tr key={b.band} className="border-b border-border-subtle/40 hover:bg-elevated/30">
                        <td className="px-3 py-2.5 text-ink-muted font-medium font-mono">{b.band}</td>
                        <td className="px-3 py-2.5 tabular-nums text-right text-ink-faint">{fmtCount(b.orders)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-right text-ink">{fmtCurrency(b.gross_sales)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-right text-ink">{fmtCurrency(b.net_revenue)}</td>
                        <td className={clsx("px-3 py-2.5 tabular-nums text-right font-medium", b.net_profit < 0 ? "text-loss" : "text-gain")}>{fmtProfit(b.net_profit)}</td>
                        <td className={clsx("px-3 py-2.5 tabular-nums text-right", b.profit_margin < 0 ? "text-loss" : "text-gain")}>{fmtPct(b.profit_margin)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-right text-ink-muted">{fmtPct(b.avg_order_margin)}</td>
                        <td className={clsx("px-3 py-2.5 tabular-nums text-right", b.loss_orders > 0 ? "text-loss" : "text-ink-faint")}>{fmtCount(b.loss_orders)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* Scatter */}
          <SectionCard>
            <SectionHeader
              title="Discount vs. profit margin (order-level)"
              description={scatter?.points.length ? `${scatter.points.length.toLocaleString()} orders plotted (sampled to 3,000 for display). Green = profitable, coral = loss-making.` : ""}
            />
            {scatter && scatter.points.length > 0 ? (
              <DiscountScatterChart
                points={scatter.points}
                breakevenDiscount={scatter.breakeven_discount}
                fitSlope={scatter.fit_slope}
                fitIntercept={scatter.fit_intercept}
                rSquared={scatter.r_squared}
              />
            ) : (
              <EmptyState title="No scatter data" description="Add a discount column to enable this view." />
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
