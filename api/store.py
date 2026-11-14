"""
In-memory dataset/analysis store.

Each uploaded dataset gets a unique session ID so uploads never overwrite
one another or the repository's sample files. Analysis results are
computed once per session and cached; filtered queries run against the
cached DataFrame.
"""

import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from profitleak.utils import load_config
from profitleak.clean import clean_data, coerce_dates, coerce_numerics, clip_discount_values
from profitleak.features import (
    engineer_temporal_features,
    engineer_discount_bands,
    engineer_order_size_tiers,
)
from profitleak.finance import compute_financial_metrics
from profitleak.analysis import (
    tag_loss_causes,
    detect_loss_orders,
    detect_breakeven_discount,
    compute_pivot_tables,
    rank_top_performers,
)

from .models import AnalysisResult, DatasetMeta, DatasetStatus

# Limits for uploaded files (kept deliberately modest for a local tool)
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
MAX_ROWS = 500_000

REPO_ROOT = Path(__file__).resolve().parent.parent


class SessionNotFoundError(Exception):
    pass


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _safe_float(v) -> Optional[float]:
    try:
        f = float(v)
        return f if f == f and abs(f) != float("inf") else None
    except (TypeError, ValueError):
        return None


def _r_squared(df: pd.DataFrame, breakeven: Dict[str, Any]) -> Optional[float]:
    """R^2 of the discount->margin linear fit used for the breakeven estimate."""
    slope = breakeven.get("fit_slope")
    intercept = breakeven.get("fit_intercept")
    if slope is None or intercept is None:
        return None
    discount_col = "discount" if "discount" in df.columns else "Discount"
    d = df[discount_col].to_numpy(dtype=float)
    m = df["profit_margin"].to_numpy(dtype=float)
    mask = np.isfinite(d) & np.isfinite(m)
    if mask.sum() < 3:
        return None
    d, m = d[mask], m[mask]
    pred = float(slope) * d + float(intercept)
    ss_res = float(np.sum((m - pred) ** 2))
    ss_tot = float(np.sum((m - m.mean()) ** 2))
    if ss_tot == 0:
        return None
    return max(0.0, 1.0 - ss_res / ss_tot)


class AnalysisStore:
    """Thread-safe store of dataset sessions and their analysis results."""

    def __init__(self, config_path: Path = REPO_ROOT / "config.yaml") -> None:
        self._lock = threading.Lock()
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._config_path = config_path

    # ------------------------------------------------------------------
    # Config
    # ------------------------------------------------------------------
    def get_config(self) -> Dict[str, Any]:
        return load_config(str(self._config_path))

    def save_config(self, new_config: Dict[str, Any]) -> None:
        import yaml

        with self._lock:
            with open(self._config_path, "w") as f:
                yaml.safe_dump(new_config, f, sort_keys=False)

    # ------------------------------------------------------------------
    # Session lifecycle
    # ------------------------------------------------------------------
    def create_session(self, df: pd.DataFrame, name: str, source: str = "upload") -> str:
        session_id = uuid.uuid4().hex[:12]
        meta = DatasetMeta(
            session_id=session_id,
            name=name,
            source=source,
            row_count=len(df),
            column_count=len(df.columns),
            status="ready",
            created_at=_now_iso(),
        )
        with self._lock:
            self._sessions[session_id] = {
                "meta": meta,
                "raw": df.copy(),
                "cleaned": None,
                "result": None,
                "breakeven_raw": None,
                "error": None,
            }
        return session_id

    def get_session(self, session_id: str) -> Dict[str, Any]:
        with self._lock:
            if session_id not in self._sessions:
                raise SessionNotFoundError(
                    "Dataset not found. Sessions are held in memory and reset when the server restarts."
                )
            return self._sessions[session_id]

    def list_sessions(self) -> list:
        with self._lock:
            return [s["meta"] for s in self._sessions.values()]

    def get_meta(self, session_id: str) -> DatasetMeta:
        return self.get_session(session_id)["meta"]

    def delete_session(self, session_id: str) -> None:
        with self._lock:
            self._sessions.pop(session_id, None)

    # ------------------------------------------------------------------
    # Analysis pipeline (reuses the existing profitleak modules)
    # ------------------------------------------------------------------
    def run_analysis(self, session_id: str, generate_reports: bool = True) -> DatasetMeta:
        """Run the full pipeline on a session's raw data. Returns updated meta."""
        session = self.get_session(session_id)
        config = self.get_config()
        raw: pd.DataFrame = session["raw"]

        session["meta"].status = "processing"
        try:
            df = self._run_pipeline(raw, config)
            breakeven_raw = detect_breakeven_discount(df, config)
            result = self._build_result(session_id, df, config, breakeven_raw)

            file_map: Dict[str, Optional[str]] = {}
            if generate_reports:
                out_dir = REPO_ROOT / "outputs" / "sessions" / session_id
                out_dir.mkdir(parents=True, exist_ok=True)
                file_map = self._export_reports(df, result.pivots, result.rankings, breakeven_raw, out_dir, config)

            session["cleaned"] = df
            session["result"] = result
            session["breakeven_raw"] = breakeven_raw
            session["meta"].status = "analyzed"
            session["meta"].analyzed_at = _now_iso()
            session["meta"].loss_order_count = result.summary.loss_orders
            session["meta"].files = file_map
            session["error"] = None
        except Exception as e:
            session["meta"].status = "error"
            session["error"] = str(e)
            raise
        return session["meta"]

    def _run_pipeline(self, raw: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        """Mirror main.py's pipeline phases on an in-memory DataFrame."""
        cols = config.get("columns", {})

        df = raw.rename(columns={v: k for k, v in cols.items() if v in raw.columns})

        df, _quality = clean_data(df, config)

        date_cols = [c for c in ["order_date", "ship_date", cols.get("order_date"), cols.get("ship_date")] if c and c in df.columns]
        df = coerce_dates(df, date_cols)

        numeric_cols = [c for c in ["sales", "quantity", "discount", "unit_cost", "shipping_cost",
                                    cols.get("sales"), cols.get("quantity"), cols.get("discount"),
                                    cols.get("unit_cost"), cols.get("shipping_cost")] if c and c in df.columns]
        df = coerce_numerics(df, numeric_cols)

        discount_col = "discount" if "discount" in df.columns else cols.get("discount")
        if discount_col and discount_col in df.columns:
            discount_range = config.get("cleaning", {}).get("discount_range", [0, 1])
            df = clip_discount_values(df, discount_col, discount_range)

        order_date_col = "order_date" if "order_date" in df.columns else cols.get("order_date")
        ship_date_col = "ship_date" if "ship_date" in df.columns else cols.get("ship_date")
        if order_date_col and order_date_col in df.columns:
            df = engineer_temporal_features(df, order_date_col, ship_date_col)

        if discount_col and discount_col in df.columns:
            df = engineer_discount_bands(df, discount_col, config)

        sales_col = "sales" if "sales" in df.columns else cols.get("sales")
        if sales_col and sales_col in df.columns:
            df = engineer_order_size_tiers(df, sales_col)

        df = compute_financial_metrics(df, config)
        df = tag_loss_causes(df, config)

        if order_date_col and order_date_col in df.columns:
            df["order_date_iso"] = df[order_date_col].dt.strftime("%Y-%m-%d")
        return df

    def _build_result(self, session_id: str, df: pd.DataFrame, config: Dict[str, Any],
                      breakeven_raw: Dict[str, Any]) -> "AnalysisResult":
        loss_df = detect_loss_orders(df)
        pivots = compute_pivot_tables(df)
        rankings = rank_top_performers(df, config)

        total_net_revenue = float(df["net_revenue"].sum())
        total_net_profit = float(df["net_profit"].sum())

        # Aggregate margin: total profit / total net revenue — the correct way
        # to aggregate a rate. The CLI's mean of row-level margins is exposed
        # separately as avg_order_margin for comparability.
        overall_margin = total_net_profit / total_net_revenue if total_net_revenue else 0.0
        avg_order_margin = float(df["profit_margin"].mean()) if len(df) else 0.0

        loss_causes: Dict[str, int] = {}
        if "loss_cause" in df.columns:
            counts = df[df["is_loss"]]["loss_cause"].value_counts()
            loss_causes = {str(k): int(v) for k, v in counts.items()}

        summary = DatasetStatus(
            orders=int(len(df)),
            gross_sales=float(df["gross_sales"].sum()),
            net_revenue=total_net_revenue,
            net_profit=total_net_profit,
            overall_margin=overall_margin,
            avg_order_margin=avg_order_margin,
            loss_orders=int(len(loss_df)),
            loss_rate=len(loss_df) / len(df) if len(df) else 0.0,
            total_loss_amount=float(loss_df["net_profit"].sum()) if len(loss_df) else 0.0,
            avg_loss_per_order=float(loss_df["net_profit"].mean()) if len(loss_df) else 0.0,
            loss_causes=loss_causes,
            breakeven_discount=_safe_float(breakeven_raw.get("overall_breakeven_discount")),
            fit_slope=_safe_float(breakeven_raw.get("fit_slope")),
            fit_intercept=_safe_float(breakeven_raw.get("fit_intercept")),
            fit_n=int(np.isfinite(df["profit_margin"].to_numpy(dtype=float)).sum()),
            r_squared=_r_squared(df, breakeven_raw),
            category_breakevens={k: _safe_float(v) for k, v in breakeven_raw.get("category_breakevens", {}).items()},
        )
        return AnalysisResult(session_id=session_id, summary=summary, pivots=pivots, rankings=rankings, df=df)

    def _export_reports(self, df, pivots, rankings, breakeven_raw, out_dir: Path, config) -> Dict[str, Optional[str]]:
        from profitleak.report import (
            export_cleaned_csv,
            export_loss_orders,
            export_pivots_to_excel,
            generate_summary_report,
        )
        from profitleak.visuals import create_dashboard

        reporting = config.get("reporting", {})
        paths = {
            "loss_orders": out_dir / reporting.get("loss_orders_file", "loss_orders.csv"),
            "cleaned_orders": out_dir / reporting.get("cleaned_data_file", "cleaned_orders.csv"),
            "pivot_workbook": out_dir / reporting.get("pivot_workbook_file", "analysis_pivots.xlsx"),
            "summary_report": out_dir / reporting.get("summary_report_file", "summary_report.md"),
            "dashboard_png": out_dir / reporting.get("dashboard_png_file", "dashboard.png"),
        }

        export_cleaned_csv(df, str(paths["cleaned_orders"]))
        export_loss_orders(df, str(paths["loss_orders"]))
        export_pivots_to_excel(pivots, str(paths["pivot_workbook"]))
        generate_summary_report(df, breakeven_raw, pivots, rankings, str(paths["summary_report"]))
        try:
            create_dashboard(df, {}, str(paths["dashboard_png"]))
        except Exception:
            del paths["dashboard_png"]  # charts are optional; never fail analysis on them

        return {k: str(v) if v.exists() else None for k, v in paths.items()}

    # ------------------------------------------------------------------
    # Result accessors
    # ------------------------------------------------------------------
    def get_result(self, session_id: str) -> "AnalysisResult":
        session = self.get_session(session_id)
        result = session.get("result")
        if result is None:
            raise SessionNotFoundError("No analysis results yet. Run the analysis first.")
        return result

    def get_df(self, session_id: str) -> pd.DataFrame:
        return self.get_result(session_id).df