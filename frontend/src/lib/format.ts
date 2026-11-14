/**
 * Formatting utilities for financial values.
 * Always use tabular numerals (via CSS class) in components.
 */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const USD2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PCT = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const NUM = new Intl.NumberFormat("en-US");

/** Format a dollar amount. Uses compact notation for |value| >= 1M. */
export function fmtCurrency(value: number | null | undefined, decimals = 0): string {
  if (value == null || !isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const compact = (value / 1_000_000).toFixed(1);
    return `$${compact}M`;
  }
  return decimals === 2 ? USD2.format(value) : USD.format(value);
}

/** Format a percentage from a decimal (0.2431 → "24.3%"). */
export function fmtPct(value: number | null | undefined, decimals = 1): string {
  if (value == null || !isFinite(value)) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Format an integer count. */
export function fmtCount(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return "—";
  return NUM.format(Math.round(value));
}

/** Format a discount percentage label from a decimal (0.30 → "30%"). */
export function fmtDiscount(value: number | null | undefined): string {
  return fmtPct(value, 1);
}

/** Format bytes to human-readable size. */
export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Format an ISO date string to a readable date. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/** Sign-aware currency: renders losses in red-readable format with minus sign. */
export function fmtProfit(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return "—";
  const abs = Math.abs(value);
  const formatted = abs >= 1_000_000
    ? `$${(abs / 1_000_000).toFixed(2)}M`
    : USD2.format(abs);
  return value < 0 ? `−${formatted}` : formatted;
}

/** Clamp a value between lo and hi. */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}
