import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/context/SessionContext";
import {
  getTimeSeries,
  getHeatmap,
  getScatter,
  getLossCauses,
  getLossOrders,
  loadSample,
  runAnalysis,
} from "@/lib/api";
import type {
  TimeSeriesPoint,
  HeatmapResponse,
  ScatterResponse,
  LossCause,
  LossOrderRow,
  LossOrdersResponse,
} from "@/types/api";
import { fmtCurrency, fmtPct, fmtCount, fmtProfit } from "@/lib/format";
import { PageHeader, MetricCard, SectionHeader, EmptyState, ErrorState, LoadingSkeleton, Badge } from "@/components/ui";
import { lossCauseTone } from "@/components/ui/Badge";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { HeatmapGrid } from "@/components/charts/HeatmapGrid";
import { DiscountScatterChart } from "@/components/charts/ScatterChart";
import { LossCauseChart } from "@/components/charts/LossCauseChart";
import { Database, ArrowRight, RefreshCw, Loader2 } from "lucide-react";

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-border rounded-lg p-5 ${className}`}>
      {children}
    </div>
  );
}

export default function Overview() {
  const { sessionId, meta, summary, refreshSummary, setSession } = useSession();
  const navigate = useNavigate();

  const [granularity, setGranularity] = useState<"month" | "quarter" | "year">("month");
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[] | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null);
  const [scatter, setScatter] = useState<ScatterResponse | null>(null);
  const [lossCauses, setLossCauses] = useState<LossCause[] | null>(null);
  const [lossOrders, setLossOrders] = useState<LossOrderRow[] | null>(null);
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [runningAnalysis, setRunningAnalysis] = useState(false);

  const analyzed = meta?.status === "analyzed";

  const fetchCharts = useCallback(async () => {
    if (!sessionId || !analyzed) return;
    setLoadingCharts(true);
    setChartError(null);
    try {
      const [ts, hm, sc, lc, lo] = await Promise.all([
        getTimeSeries(sessionId, granularity),
        getHeatmap(sessionId),
        getScatter(sessionId),
        getLossCauses(sessionId),
        getLossOrders(sessionId, { sort_by: "net_profit", sort_dir: "asc", page_size: 10 }),
      ]);
      setTimeSeries(ts.points);
      setHeatmap(hm);
      setScatter(sc);
      setLossCauses(lc.causes);
      setLossOrders(lo.rows);
    } catch (e) {
      setChartError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingCharts(false);
    }
  }, [sessionId, analyzed, granularity]);

  useEffect(() => {
    fetchCharts();
  }, [fetchCharts]);

  const handleLoadSample = async () => {
    setLoadingSample(true);
    setSampleError(null);
    try {
      const { session_id, meta: newMeta } = await loadSample();
      setSession(session_id, newMeta);
      // Run analysis
      setRunningAnalysis(true);
      await runAnalysis(session_id);
      await refreshSummary();
      setRunningAnalysis(false);
    } catch (e) {
      setSampleError(e instanceof Error ? e.message : String(e));
      setRunningAnalysis(false);
    } finally {
      setLoadingSample(false);
    }
  };

  // No session: welcome/onboarding state
  if (!sessionId || !meta) {
    return (
      <div className="px-6 lg:px-8 py-8">
        <PageHeader
          title="Profitability overview"
          description="Understand what you're earning, where margin is eroding, and which orders need attention."
        />
        <div className="mt-6 flex flex-col items-center justify-center gap-5 py-16 border border-border-subtle border-dashed rounded-lg bg-surface/40">
          <Database size={36} className="text-ink-faint" strokeWidth={1.25} />
          <div className="text-center">
            <p className="text-sm font-medium text-ink-muted">No dataset loaded</p>
            <p className="text-xs text-ink-faint mt-1">Load the sample dataset to explore the analysis, or import your own data.</p>
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={handleLoadSample}
              disabled={loadingSample || runningAnalysis}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-canvas rounded-md hover:bg-accent-dim transition-colors disabled:opacity-60"
            >
              {(loadingSample || runningAnalysis) && <Loader2 size={14} className="animate-spin" />}
              {runningAnalysis ? "Running analysis…" : loadingSample ? "Loading…" : "Load sample data"}
            </button>
            <button
              onClick={() => navigate("/data")}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border text-ink-muted rounded-md hover:text-ink hover:border-ink-faint transition-colors"
            >
              Import your data
              <ArrowRight size={14} />
            </button>
          </div>
          {sampleError && <p className="text-xs text-loss font-mono">{sampleError}</p>}
        </div>
      </div>
    );
  }

  if (meta.status === "ready") {
    return (
      <div className="px-6 lg:px-8 py-8">
        <PageHeader title="Profitability overview" description="Dataset loaded. Run the analysis to see results." />
        <div className="mt-6 flex flex-col items-center justify-center gap-4 py-12 border border-border-subtle border-dashed rounded-lg bg-surface/40">
          <p className="text-sm text-ink-muted">{meta.name} · {meta.row_count.toLocaleString()} rows</p>
          <button
            onClick={async () => {
              setRunningAnalysis(true);
              try {
                await runAnalysis(sessionId);
                await refreshSummary();
              } catch (e) {
                setChartError(e instanceof Error ? e.message : String(e));
              } finally {
                setRunningAnalysis(false);
              }
            }}
            disabled={runningAnalysis}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-canvas rounded-md hover:bg-accent-dim disabled:opacity-60 transition-colors"
          >
            {runningAnalysis && <Loader2 size={14} className="animate-spin" />}
            {runningAnalysis ? "Running analysis…" : "Run analysis"}
          </button>
        </div>
      </div>
    );
  }

  if (meta.status === "error") {
    return (
      <div className="px-6 lg:px-8 py-8">
        <PageHeader title="Profitability overview" />
        <ErrorState title="Analysis failed" message={meta.error ?? "Unknown error"} />
      </div>
    );
  }

  const s = summary?.summary;

  return (
    <div className="px-6 lg:px-8 py-8 space-y-8">
      <PageHeader
        title="Profitability overview"
        description="Understand what you're earning, where margin is eroding, and which orders need attention."
      />

      {/* ── Executive metrics ─────────────────────────────────────────────── */}
      <section aria-label="Executive metrics">
        {s ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-0 border border-border rounded-lg overflow-hidden divide-x divide-y divide-border bg-surface">
            {/* Primary */}
            <div className="col-span-2 sm:col-span-1 p-5">
              <MetricCard
                label="Net profit"
                value={fmtCurrency(s.net_profit)}
                sub={`${fmtPct(s.overall_margin)} overall margin`}
                tone={s.net_profit < 0 ? "loss" : "gain"}
                size="lg"
              />
            </div>
            <div className="p-5">
              <MetricCard label="Gross sales" value={fmtCurrency(s.gross_sales)} size="md" />
            </div>
            <div className="p-5">
              <MetricCard label="Net revenue" value={fmtCurrency(s.net_revenue)} size="md" />
            </div>
            <div className="p-5">
              <MetricCard
                label="Loss-making orders"
                value={fmtCount(s.loss_orders)}
                sub={`${fmtPct(s.loss_rate)} of ${fmtCount(s.orders)} total`}
                tone="loss"
                size="md"
              />
            </div>
            <div className="p-5">
              <MetricCard
                label="Avg loss / order"
                value={fmtProfit(s.avg_loss_per_order)}
                sub={`Total: ${fmtProfit(s.total_loss_amount)}`}
                tone="loss"
                size="md"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-px border border-border rounded-lg overflow-hidden bg-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-surface p-5">
                <LoadingSkeleton rows={2} cols={1} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Charts grid ───────────────────────────────────────────────────── */}
      {chartError && <ErrorState message={chartError} retry={fetchCharts} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* A. Revenue vs Profit over time */}
        <SectionCard className="lg:col-span-2">
          <SectionHeader
            title="Revenue vs. profit over time"
            description="Gross sales, net revenue, and net profit grouped by period."
          />
          {loadingCharts ? (
            <div className="h-64 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-ink-faint" />
            </div>
          ) : timeSeries && timeSeries.length > 0 ? (
            <TimeSeriesChart
              points={timeSeries}
              granularity={granularity}
              onGranularityChange={setGranularity}
            />
          ) : (
            <EmptyState
              title="No time series data"
              description="Add an order_date column to your dataset to see trends over time."
            />
          )}
        </SectionCard>

        {/* B. Category × Region heatmap */}
        <SectionCard>
          <SectionHeader
            title="Profitability by category and region"
            description="Aggregate margin and net profit per cell. Click a cell to filter the Loss Explorer."
          />
          {loadingCharts ? (
            <LoadingSkeleton rows={4} cols={4} />
          ) : heatmap && heatmap.cells.length > 0 ? (
            <HeatmapGrid
              categories={heatmap.categories}
              regions={heatmap.regions}
              cells={heatmap.cells}
              onCellClick={(cat, reg) => navigate(`/loss-explorer?category=${encodeURIComponent(cat)}&region=${encodeURIComponent(reg)}`)}
            />
          ) : (
            <EmptyState
              title="No heatmap data"
              description="Add category and region columns to enable this view."
            />
          )}
        </SectionCard>

        {/* C. Discount vs margin scatter */}
        <SectionCard>
          <SectionHeader
            title="Discount vs. profit margin"
            description={
              s?.breakeven_discount
                ? `Estimated breakeven discount: ${fmtPct(s.breakeven_discount)}. Orders above this level tend to be unprofitable.`
                : "Each point is one order. Add a discount column to see this analysis."
            }
          />
          {loadingCharts ? (
            <div className="h-64 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-ink-faint" />
            </div>
          ) : scatter && scatter.points.length > 0 ? (
            <DiscountScatterChart
              points={scatter.points}
              breakevenDiscount={scatter.breakeven_discount}
              fitSlope={scatter.fit_slope}
              fitIntercept={scatter.fit_intercept}
              rSquared={scatter.r_squared}
            />
          ) : (
            <EmptyState title="No scatter data" description="Add discount and revenue columns to your dataset." />
          )}
        </SectionCard>

        {/* D. Loss-cause breakdown */}
        <SectionCard className="lg:col-span-2">
          <SectionHeader
            title="Loss-cause analysis"
            description="Loss-making orders classified by threshold-based cause. Click a bar to filter the Loss Explorer."
          />
          {loadingCharts ? (
            <LoadingSkeleton rows={4} cols={3} />
          ) : lossCauses && lossCauses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <LossCauseChart
                causes={lossCauses}
                onCauseClick={(cause) => navigate(`/loss-explorer?loss_cause=${encodeURIComponent(cause)}`)}
              />
              <div className="space-y-2">
                {lossCauses.map((c) => (
                  <div key={c.cause} className="flex items-center justify-between py-1.5 border-b border-border-subtle/50 last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={lossCauseTone(c.cause)}>{c.cause}</Badge>
                      <span className="text-xs text-ink-muted tabular-nums">{fmtCount(c.count)} orders</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs tabular-nums text-loss">{fmtProfit(c.total_loss)}</span>
                      <span className="text-2xs text-ink-faint font-mono ml-2">({fmtPct(c.share)})</span>
                    </div>
                  </div>
                ))}
                <p className="text-2xs text-ink-faint mt-3 leading-snug">
                  Loss cause is a heuristic tag based on configured discount and shipping thresholds.
                  It is an indicator, not a proven causal attribution.
                </p>
              </div>
            </div>
          ) : (
            <EmptyState title="No loss cause data" />
          )}
        </SectionCard>
      </div>

      {/* ── Loss orders table ─────────────────────────────────────────────── */}
      <SectionCard>
        <SectionHeader
          title="Orders requiring attention"
          description="Largest loss-making orders by net profit loss."
          actions={
            <button
              onClick={() => navigate("/loss-explorer")}
              className="flex items-center gap-1.5 text-xs text-accent hover:underline"
            >
              View all loss-making orders <ArrowRight size={12} />
            </button>
          }
        />
        {loadingCharts ? (
          <LoadingSkeleton rows={6} cols={7} />
        ) : lossOrders && lossOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-subtle">
                  {["Order ID", "Date", "Product", "Category", "Net Revenue", "Net Profit", "Margin", "Discount", "Cause"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-2xs font-mono uppercase tracking-widest text-ink-faint whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lossOrders.map((row, i) => (
                  <tr
                    key={row.order_id ?? i}
                    className="border-b border-border-subtle/50 hover:bg-elevated/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/loss-explorer?order_id=${encodeURIComponent(row.order_id ?? "")}`)}
                  >
                    <td className="px-3 py-2 font-mono text-2xs text-ink-faint">{row.order_id ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-faint font-mono text-2xs whitespace-nowrap">{row.order_date ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-muted max-w-[180px] truncate">{row.product_name ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-faint whitespace-nowrap">{row.category ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-right text-ink">{fmtCurrency(row.net_revenue)}</td>
                    <td className="px-3 py-2 tabular-nums text-right text-loss font-medium">{fmtProfit(row.net_profit)}</td>
                    <td className="px-3 py-2 tabular-nums text-right text-loss">{fmtPct(row.profit_margin)}</td>
                    <td className="px-3 py-2 tabular-nums text-right text-ink-muted">{fmtPct(row.discount)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={lossCauseTone(row.loss_cause)}>{row.loss_cause}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No loss-making orders" description="Run the analysis to see the worst-performing orders here." />
        )}
      </SectionCard>
    </div>
  );
}
