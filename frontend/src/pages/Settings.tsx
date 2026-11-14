import React, { useEffect, useState, useCallback } from "react";
import { getSettings, putSettings, runAnalysis } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import type { AppConfig } from "@/types/api";
import { fmtPct } from "@/lib/format";
import {
  PageHeader,
  SectionHeader,
  ErrorState,
  LoadingSkeleton,
  Badge,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { Save, RefreshCw, AlertCircle, CheckCircle2, RotateCcw, Loader2 } from "lucide-react";
import clsx from "clsx";

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-border rounded-lg p-5 ${className}`}>
      {children}
    </div>
  );
}

export default function Settings() {
  const { sessionId, meta, refreshSummary } = useSession();
  const showToast = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Original saved configuration
  const [savedConfig, setSavedConfig] = useState<AppConfig | null>(null);

  // Form draft state
  const [unitCostPct, setUnitCostPct] = useState<number>(0.40);
  const [shippingCostPct, setShippingCostPct] = useState<number>(0.10);
  const [paymentFeePct, setPaymentFeePct] = useState<number>(0.03);

  const [discountLossThreshold, setDiscountLossThreshold] = useState<number>(0.30);
  const [shippingLossThreshold, setShippingLossThreshold] = useState<number>(0.15);

  const [topNProducts, setTopNProducts] = useState<number>(10);
  const [bottomNProducts, setBottomNProducts] = useState<number>(10);

  const [bandsInput, setBandsInput] = useState<string>("0.0, 0.01, 0.11, 0.21, 0.31, 0.41, 1.0");
  const [labelsInput, setLabelsInput] = useState<string>("0%, 1-10%, 11-20%, 21-30%, 31-40%, 41%+");

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSettings();
      const cfg = res.config;
      setSavedConfig(cfg);

      const finance = cfg.finance ?? {};
      setUnitCostPct(finance.unit_cost_pct_of_sales ?? 0.40);
      setShippingCostPct(finance.shipping_cost_pct_of_sales ?? 0.10);
      setPaymentFeePct(finance.payment_fee_pct ?? 0.0);

      const analysis = cfg.analysis ?? {};
      setDiscountLossThreshold(analysis.discount_loss_threshold ?? 0.30);
      setShippingLossThreshold(analysis.shipping_loss_threshold ?? 0.15);

      const reporting = cfg.reporting ?? {};
      setTopNProducts(reporting.top_n_products ?? 10);
      setBottomNProducts(reporting.bottom_n_products ?? 10);

      const features = cfg.features ?? {};
      if (features.discount_bands) {
        setBandsInput(features.discount_bands.join(", "));
      }
      if (features.discount_band_labels) {
        setLabelsInput(features.discount_band_labels.join(", "));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Check if form is dirty
  const isDirty = savedConfig ? (
    unitCostPct !== (savedConfig.finance?.unit_cost_pct_of_sales ?? 0.40) ||
    shippingCostPct !== (savedConfig.finance?.shipping_cost_pct_of_sales ?? 0.10) ||
    paymentFeePct !== (savedConfig.finance?.payment_fee_pct ?? 0.0) ||
    discountLossThreshold !== (savedConfig.analysis?.discount_loss_threshold ?? 0.30) ||
    shippingLossThreshold !== (savedConfig.analysis?.shipping_loss_threshold ?? 0.15) ||
    topNProducts !== (savedConfig.reporting?.top_n_products ?? 10) ||
    bottomNProducts !== (savedConfig.reporting?.bottom_n_products ?? 10) ||
    bandsInput !== (savedConfig.features?.discount_bands?.join(", ") ?? "") ||
    labelsInput !== (savedConfig.features?.discount_band_labels?.join(", ") ?? "")
  ) : false;

  const handleReset = () => {
    if (savedConfig) {
      const finance = savedConfig.finance ?? {};
      setUnitCostPct(finance.unit_cost_pct_of_sales ?? 0.40);
      setShippingCostPct(finance.shipping_cost_pct_of_sales ?? 0.10);
      setPaymentFeePct(finance.payment_fee_pct ?? 0.0);

      const analysis = savedConfig.analysis ?? {};
      setDiscountLossThreshold(analysis.discount_loss_threshold ?? 0.30);
      setShippingLossThreshold(analysis.shipping_loss_threshold ?? 0.15);

      const reporting = savedConfig.reporting ?? {};
      setTopNProducts(reporting.top_n_products ?? 10);
      setBottomNProducts(reporting.bottom_n_products ?? 10);

      const features = savedConfig.features ?? {};
      setBandsInput(features.discount_bands?.join(", ") ?? "");
      setLabelsInput(features.discount_band_labels?.join(", ") ?? "");
      setValidationErrors([]);
    }
  };

  const handleSave = async () => {
    setValidationErrors([]);
    const errors: string[] = [];

    // Client-side validation
    if (isNaN(unitCostPct) || unitCostPct < 0 || unitCostPct > 1) {
      errors.push("Unit cost assumption must be between 0% and 100%");
    }
    if (isNaN(shippingCostPct) || shippingCostPct < 0 || shippingCostPct > 1) {
      errors.push("Shipping cost assumption must be between 0% and 100%");
    }
    if (isNaN(paymentFeePct) || paymentFeePct < 0 || paymentFeePct > 1) {
      errors.push("Payment fee percentage must be between 0% and 100%");
    }
    if (isNaN(discountLossThreshold) || discountLossThreshold < 0 || discountLossThreshold > 1) {
      errors.push("Discount loss threshold must be between 0% and 100%");
    }
    if (isNaN(shippingLossThreshold) || shippingLossThreshold < 0 || shippingLossThreshold > 1) {
      errors.push("Shipping loss threshold must be between 0% and 100%");
    }

    const parsedBands = bandsInput
      .split(",")
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));
    const parsedLabels = labelsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (parsedBands.length < 2) {
      errors.push("Discount bands must include at least 2 cutoff points");
    }
    if (parsedBands.length - 1 !== parsedLabels.length) {
      errors.push(
        `Discount bands count (${parsedBands.length}) requires exactly ${parsedBands.length - 1} labels (provided: ${parsedLabels.length})`
      );
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      showToast("Validation failed. Check the errors list.", "error");
      return;
    }

    setSaving(true);
    try {
      const payload: AppConfig = {
        finance: {
          unit_cost_pct_of_sales: unitCostPct,
          shipping_cost_pct_of_sales: shippingCostPct,
          payment_fee_pct: paymentFeePct,
        },
        analysis: {
          discount_loss_threshold: discountLossThreshold,
          shipping_loss_threshold: shippingLossThreshold,
        },
        reporting: {
          top_n_products: topNProducts,
          bottom_n_products: bottomNProducts,
        },
        features: {
          discount_bands: parsedBands,
          discount_band_labels: parsedLabels,
        },
      };

      const res = await putSettings(payload);
      setSavedConfig(res.config);
      showToast("Configuration saved to config.yaml", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save configuration", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReanalyze = async () => {
    if (!sessionId) return;
    setReanalyzing(true);
    try {
      await runAnalysis(sessionId, true);
      await refreshSummary();
      showToast("Re-analyzed active dataset with new settings", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Re-analysis failed", "error");
    } finally {
      setReanalyzing(false);
    }
  };

  return (
    <div className="px-6 lg:px-8 py-8 space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Settings & Cost Assumptions"
        description="Configure financial baseline assumptions, discount bands, and loss categorization thresholds. Changes take effect on subsequent analysis runs."
        actions={
          <div className="flex items-center gap-2">
            {isDirty && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border text-ink-muted rounded-md hover:text-ink transition-colors"
              >
                <RotateCcw size={13} />
                Revert changes
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-accent text-canvas rounded-md hover:bg-accent-dim transition-colors disabled:opacity-40"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save Configuration
            </button>
          </div>
        }
      />

      {error && <ErrorState message={error} retry={fetchConfig} />}
      {loading && <LoadingSkeleton rows={6} cols={3} />}

      {/* Validation Feedback */}
      {validationErrors.length > 0 && (
        <div className="p-4 bg-loss/10 border border-loss/30 rounded-lg text-xs text-loss space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertCircle size={14} /> Validation Errors:
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Active dataset re-run notification */}
      {meta?.status === "analyzed" && !isDirty && (
        <div className="flex items-center justify-between p-3.5 bg-canvas border border-border rounded-lg text-xs">
          <div className="flex items-center gap-2 text-ink-muted">
            <CheckCircle2 size={16} className="text-gain shrink-0" />
            <span>
              Active dataset: <strong className="text-ink">{meta.name}</strong>. Apply these
              settings to the active session:
            </span>
          </div>
          <button
            onClick={handleReanalyze}
            disabled={reanalyzing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-elevated border border-border text-ink hover:text-accent hover:border-accent rounded-md transition-colors"
          >
            {reanalyzing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Re-run Analysis Now
          </button>
        </div>
      )}

      {!loading && (
        <div className="space-y-6">
          {/* Section 1: Financial & Cost Assumptions */}
          <SectionCard>
            <SectionHeader
              title="Financial Baseline & Fallback Estimates"
              description="Used when raw datasets lack explicit item-level unit cost or order shipping cost values."
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="text-xs font-semibold text-ink block mb-1">
                  Default COGS (% of gross sales)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={Math.round(unitCostPct * 100)}
                    onChange={(e) => setUnitCostPct(parseFloat(e.target.value || "0") / 100)}
                    className="w-24 text-xs font-mono tabular-nums bg-canvas border border-border rounded px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <span className="text-xs text-ink-faint font-mono">%</span>
                </div>
                <p className="text-2xs text-ink-faint mt-1">
                  Fallback when Unit Cost column is absent or null. Current: {fmtPct(unitCostPct)}.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink block mb-1">
                  Default Shipping (% of gross sales)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={Math.round(shippingCostPct * 100)}
                    onChange={(e) => setShippingCostPct(parseFloat(e.target.value || "0") / 100)}
                    className="w-24 text-xs font-mono tabular-nums bg-canvas border border-border rounded px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <span className="text-xs text-ink-faint font-mono">%</span>
                </div>
                <p className="text-2xs text-ink-faint mt-1">
                  Fallback when Shipping Cost column is absent. Current: {fmtPct(shippingCostPct)}.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink block mb-1">
                  Payment Processing Fee (% of net rev)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="10"
                    value={(paymentFeePct * 100).toFixed(1)}
                    onChange={(e) => setPaymentFeePct(parseFloat(e.target.value || "0") / 100)}
                    className="w-24 text-xs font-mono tabular-nums bg-canvas border border-border rounded px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <span className="text-xs text-ink-faint font-mono">%</span>
                </div>
                <p className="text-2xs text-ink-faint mt-1">
                  Variable payment gateway cut. Current: {fmtPct(paymentFeePct)}.
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Section 2: Loss-Cause Tagging Thresholds */}
          <SectionCard>
            <SectionHeader
              title="Forensic Loss-Cause Thresholds"
              description="Rules for assigning heuristic loss causes (Discount-driven, Shipping-driven, Both, Cost-driven)."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="text-xs font-semibold text-ink block mb-1">
                  Discount-Driven Loss Cutoff
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={Math.round(discountLossThreshold * 100)}
                    onChange={(e) => setDiscountLossThreshold(parseFloat(e.target.value || "0") / 100)}
                    className="w-24 text-xs font-mono tabular-nums bg-canvas border border-border rounded px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <span className="text-xs text-ink-faint font-mono">%</span>
                </div>
                <p className="text-2xs text-ink-faint mt-1">
                  Loss orders with discount ≥ this cutoff are tagged as Discount-driven (or Both).
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink block mb-1">
                  Shipping-Driven Loss Cutoff (% of net rev)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={Math.round(shippingLossThreshold * 100)}
                    onChange={(e) => setShippingLossThreshold(parseFloat(e.target.value || "0") / 100)}
                    className="w-24 text-xs font-mono tabular-nums bg-canvas border border-border rounded px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <span className="text-xs text-ink-faint font-mono">%</span>
                </div>
                <p className="text-2xs text-ink-faint mt-1">
                  Loss orders where shipping ≥ this ratio of revenue are tagged as Shipping-driven.
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Section 3: Discount Band Intervals */}
          <SectionCard>
            <SectionHeader
              title="Discount Band Bucketing"
              description="Bins for grouping orders in the discount analysis and pivot views."
            />
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-ink block mb-1">
                  Cutoff Points (0 to 1 scale, comma-separated)
                </label>
                <input
                  type="text"
                  value={bandsInput}
                  onChange={(e) => setBandsInput(e.target.value)}
                  className="w-full text-xs font-mono bg-canvas border border-border rounded px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink block mb-1">
                  Band Labels (comma-separated, length must equal cutoffs - 1)
                </label>
                <input
                  type="text"
                  value={labelsInput}
                  onChange={(e) => setLabelsInput(e.target.value)}
                  className="w-full text-xs font-mono bg-canvas border border-border rounded px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
          </SectionCard>

          {/* Section 4: Reporting & Output Scope */}
          <SectionCard>
            <SectionHeader
              title="Reporting Limits"
              description="Quantity of top and bottom performers included in generated reports."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="text-xs font-semibold text-ink block mb-1">
                  Top Performers Count (N)
                </label>
                <input
                  type="number"
                  min="5"
                  max="50"
                  value={topNProducts}
                  onChange={(e) => setTopNProducts(parseInt(e.target.value || "10", 10))}
                  className="w-24 text-xs font-mono bg-canvas border border-border rounded px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink block mb-1">
                  Bottom Performers Count (N)
                </label>
                <input
                  type="number"
                  min="5"
                  max="50"
                  value={bottomNProducts}
                  onChange={(e) => setBottomNProducts(parseInt(e.target.value || "10", 10))}
                  className="w-24 text-xs font-mono bg-canvas border border-border rounded px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
