"""
Query service: builds frontend-ready aggregates from an analyzed session.

All numbers here are derived from the pipeline's own outputs
(net_profit, profit_margin, is_loss, loss_cause, ...) — no financial
formulas are redefined in this layer. Aggregation rules:

- Sums (gross_sales, net_revenue, net_profit) are summed.
- Rates (margins) are recomputed as sum(profit)/sum(revenue) — aggregate
  margin — except where a mean of row margins is explicitly requested.
"""

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from .models import (
    BreakdownRow,
    DiscountBandStats,
    HeatmapCell,
    LossOrderRow,
    ProductRow,
    TimeSeriesPoint,
)
from .store import AnalysisStore, SessionNotFoundError


def _agg_margin(profit: float, revenue: float) -> float:
    return profit / revenue if revenue else 0.0


def _col(df: pd.DataFrame, *names: str) -> Optional[str]:
    """Return the first matching column name."""
    for n in names:
        if n in df.columns:
            return n
    return None


def _safe(v, default=None):
    try:
        if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):
            return default
        if v != v:  # NaN for non-float
            return default
        return v
    except (TypeError, ValueError):
        return default


def _series_safe(s: pd.Series, default=None) -> pd.Series:
    return s.where(s.notna() & np.isfinite(s.astype(float)), default)


# ---------------------------------------------------------------------------
# Time series
# ---------------------------------------------------------------------------

def time_series(store: AnalysisStore, session_id: str, granularity: str = "month") -> List[TimeSeriesPoint]:
    df = store.get_df(session_id)
    date_col = _col(df, "order_date", "Order Date")
    if date_col is None or df[date_col].notna().sum() == 0:
        return []

    d = df[[date_col, "gross_sales", "net_revenue", "net_profit", "is_loss"]].dropna(subset=[date_col]).copy()
    if not pd.api.types.is_datetime64_any_dtype(d[date_col]):
        d[date_col] = pd.to_datetime(d[date_col], errors="coerce")
        d = d.dropna(subset=[date_col])
    if granularity == "year":
        period = d[date_col].dt.to_period("Y")
    elif granularity == "quarter":
        period = d[date_col].dt.to_period("Q")
    else:
        period = d[date_col].dt.to_period("M")

    g = d.groupby(period).agg(
        gross_sales=("gross_sales", "sum"),
        net_revenue=("net_revenue", "sum"),
        net_profit=("net_profit", "sum"),
        orders=("net_profit", "size"),
        loss_orders=("is_loss", "sum"),
    ).sort_index()

    return [
        TimeSeriesPoint(
            period=str(idx),
            gross_sales=float(r.gross_sales),
            net_revenue=float(r.net_revenue),
            net_profit=float(r.net_profit),
            orders=int(r.orders),
            loss_orders=int(r.loss_orders),
        )
        for idx, r in g.iterrows()
    ]


# ---------------------------------------------------------------------------
# Category x Region heatmap
# ---------------------------------------------------------------------------

def category_region_heatmap(store: AnalysisStore, session_id: str) -> Optional[Dict[str, Any]]:
    df = store.get_df(session_id)
    cat_col = _col(df, "category", "Category")
    reg_col = _col(df, "region", "Region")
    if cat_col is None or reg_col is None:
        return None

    d = df[[cat_col, reg_col, "net_profit", "net_revenue", "is_loss"]].dropna(subset=[cat_col, reg_col])
    g = d.groupby([cat_col, reg_col]).agg(
        net_profit=("net_profit", "sum"),
        net_revenue=("net_revenue", "sum"),
        orders=("net_revenue", "size"),
        loss_orders=("is_loss", "sum"),
    ).reset_index()
    g["profit_margin"] = g.apply(lambda r: _agg_margin(r.net_profit, r.net_revenue), axis=1)

    categories = sorted(d[cat_col].astype(str).unique().tolist())
    regions = sorted(d[reg_col].astype(str).unique().tolist())
    cells = [
        HeatmapCell(
            category=str(r[cat_col]),
            region=str(r[reg_col]),
            net_profit=float(r.net_profit),
            profit_margin=float(r.profit_margin),
            orders=int(r.orders),
            loss_orders=int(r.loss_orders),
        )
        for _, r in g.iterrows()
    ]
    return {"categories": categories, "regions": regions, "cells": cells}


# ---------------------------------------------------------------------------
# Discount vs margin scatter
# ---------------------------------------------------------------------------

def discount_margin_scatter(
    store: AnalysisStore, session_id: str, max_points: int = 3000
) -> Dict[str, Any]:
    df = store.get_df(session_id)
    discount_col = _col(df, "discount", "Discount")
    if discount_col is None:
        return {"points": [], "breakeven_discount": None, "r_squared": None}

    d = df[[discount_col, "profit_margin", "net_revenue", "is_loss"]].copy()
    d = d[np.isfinite(d[discount_col].astype(float)) & np.isfinite(d["profit_margin"].astype(float))]
    if len(d) > max_points:
        d = d.sample(n=max_points, random_state=42)

    summary = store.get_result(session_id).summary
    points = [
        {
            "discount": float(r[discount_col]),
            "profit_margin": float(r.profit_margin),
            "net_revenue": float(r.net_revenue),
            "is_loss": bool(r.is_loss),
        }
        for _, r in d.iterrows()
    ]
    return {
        "points": points,
        "breakeven_discount": summary.breakeven_discount,
        "fit_slope": summary.fit_slope,
        "fit_intercept": summary.fit_intercept,
        "r_squared": summary.r_squared,
        "fit_n": summary.fit_n,
    }


# ---------------------------------------------------------------------------
# Discount bands
# ---------------------------------------------------------------------------

def discount_bands(store: AnalysisStore, session_id: str) -> List[DiscountBandStats]:
    df = store.get_df(session_id)
    band_col = _col(df, "discount_band")
    if band_col is None:
        return []

    # Preserve configured band order (categorical ordering from pd.cut)
    order = [str(x) for x in df[band_col].cat.categories] if hasattr(df[band_col], "cat") else None
    d = df[[band_col, "gross_sales", "net_revenue", "net_profit", "is_loss", "profit_margin"]].dropna(subset=[band_col])
    g = d.groupby(band_col, observed=True).agg(
        orders=("net_profit", "size"),
        gross_sales=("gross_sales", "sum"),
        net_revenue=("net_revenue", "sum"),
        net_profit=("net_profit", "sum"),
        loss_orders=("is_loss", "sum"),
        avg_order_margin=("profit_margin", "mean"),
    ).reset_index()

    rows = []
    for _, r in g.iterrows():
        rows.append(DiscountBandStats(
            band=str(r[band_col]),
            orders=int(r.orders),
            gross_sales=float(r.gross_sales),
            net_revenue=float(r.net_revenue),
            net_profit=float(r.net_profit),
            profit_margin=_agg_margin(float(r.net_profit), float(r.net_revenue)),
            avg_order_margin=float(r.avg_order_margin),
            loss_orders=int(r.loss_orders),
        ))
    if order:
        rows.sort(key=lambda r: order.index(r.band) if r.band in order else 999)
    return rows


# ---------------------------------------------------------------------------
# Loss explorer
# ---------------------------------------------------------------------------

LOSS_CAUSES = ["Both", "Discount-driven", "Shipping-driven", "Cost-driven"]


def loss_orders_query(
    store: AnalysisStore,
    session_id: str,
    search: str = "",
    category: Optional[str] = None,
    sub_category: Optional[str] = None,
    region: Optional[str] = None,
    segment: Optional[str] = None,
    loss_cause: Optional[str] = None,
    discount_min: Optional[float] = None,
    discount_max: Optional[float] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = "net_profit",
    sort_dir: str = "asc",
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    df = store.get_df(session_id)
    loss_df = df[df["is_loss"]].copy()

    order_id_col = _col(loss_df, "order_id", "Order ID")
    product_col = _col(loss_df, "product_name", "Product Name")
    cat_col = _col(loss_df, "category", "Category")
    subcat_col = _col(loss_df, "sub_category", "Sub-Category")
    reg_col = _col(loss_df, "region", "Region")
    seg_col = _col(loss_df, "segment", "Segment")
    date_col = _col(loss_df, "order_date", "Order Date")
    discount_col = _col(loss_df, "discount", "Discount")

    # --- filters ---
    if search and product_col:
        mask = loss_df[product_col].astype(str).str.contains(search, case=False, na=False)
        if order_id_col:
            mask = mask | loss_df[order_id_col].astype(str).str.contains(search, case=False, na=False)
        loss_df = loss_df[mask]
    if category and cat_col:
        loss_df = loss_df[loss_df[cat_col].astype(str) == category]
    if sub_category and subcat_col:
        loss_df = loss_df[loss_df[subcat_col].astype(str) == sub_category]
    if region and reg_col:
        loss_df = loss_df[loss_df[reg_col].astype(str) == region]
    if segment and seg_col:
        loss_df = loss_df[loss_df[seg_col].astype(str) == segment]
    if loss_cause and "loss_cause" in loss_df.columns:
        loss_df = loss_df[loss_df["loss_cause"].astype(str) == loss_cause]
    if discount_col is not None:
        if discount_min is not None:
            loss_df = loss_df[loss_df[discount_col].astype(float) >= discount_min]
        if discount_max is not None:
            loss_df = loss_df[loss_df[discount_col].astype(float) <= discount_max]
    if date_from and date_col:
        loss_df = loss_df[loss_df[date_col] >= pd.Timestamp(date_from)]
    if date_to and date_col:
        loss_df = loss_df[loss_df[date_col] <= pd.Timestamp(date_to) + pd.Timedelta(days=1)]

    total_matches = len(loss_df)
    total_loss = float(loss_df["net_profit"].sum()) if total_matches else 0.0
    avg_loss = float(loss_df["net_profit"].mean()) if total_matches else 0.0

    # --- sort ---
    sort_map = {
        "net_profit": "net_profit",
        "net_revenue": "net_revenue",
        "gross_sales": "gross_sales",
        "discount": discount_col or "net_profit",
        "order_date": date_col or "net_profit",
    }
    sort_col = sort_map.get(sort_by, "net_profit")
    loss_df = loss_df.sort_values(sort_col, ascending=(sort_dir != "desc"))

    # --- paginate ---
    page_size = max(1, min(page_size, 500))
    page = max(1, page)
    start = (page - 1) * page_size
    chunk = loss_df.iloc[start:start + page_size]

    def _iso(v):
        ts = _safe(v)
        try:
            return pd.Timestamp(ts).strftime("%Y-%m-%d") if ts is not None else None
        except (TypeError, ValueError):
            return None

    rows = [
        LossOrderRow(
            order_id=str(_safe(r[order_id_col], "—")) if order_id_col else None,
            order_date=_iso(r[date_col]) if date_col else None,
            product_name=str(_safe(r[product_col], "—")) if product_col else None,
            category=str(_safe(r[cat_col], "—")) if cat_col else None,
            sub_category=str(_safe(r[subcat_col], "—")) if subcat_col else None,
            region=str(_safe(r[reg_col], "—")) if reg_col else None,
            segment=str(_safe(r[seg_col], "—")) if seg_col else None,
            gross_sales=float(r.gross_sales),
            discount=float(r[discount_col]) if discount_col else 0.0,
            net_revenue=float(r.net_revenue),
            net_profit=float(r.net_profit),
            profit_margin=float(r.profit_margin),
            shipping_cost=float(r.shipping_cost),
            loss_cause=str(r.get("loss_cause", "Unknown")),
        )
        for _, r in chunk.iterrows()
    ]
    return {
        "total_matches": total_matches,
        "total_loss_amount": total_loss,
        "avg_loss_per_order": avg_loss,
        "rows": rows,
    }


def loss_cause_summary(store: AnalysisStore, session_id: str) -> List[Dict[str, Any]]:
    df = store.get_df(session_id)
    if "loss_cause" not in df.columns:
        return []
    loss_df = df[df["is_loss"]]
    g = loss_df.groupby("loss_cause").agg(
        count=("net_profit", "size"),
        total_loss=("net_profit", "sum"),
    ).sort_values("count", ascending=False)
    n = len(loss_df) or 1
    return [
        {
            "cause": str(idx),
            "count": int(r["count"]),
            "share": int(r["count"]) / n,
            "total_loss": float(r["total_loss"]),
        }
        for idx, r in g.iterrows()
    ]


def order_detail(store: AnalysisStore, session_id: str, order_id: str) -> Optional[Dict[str, Any]]:
    df = store.get_df(session_id)
    order_id_col = _col(df, "order_id", "Order ID")
    if order_id_col is None:
        return None
    match = df[df[order_id_col].astype(str) == str(order_id)]
    if match.empty:
        return None

    row = match.iloc[0]

    def val(colnames):
        for c in colnames:
            if c in match.columns:
                v = _safe(row[c])
                if v is not None:
                    if isinstance(v, (np.integer,)):
                        return int(v)
                    if isinstance(v, (np.floating,)):
                        return float(v)
                    if isinstance(v, pd.Timestamp):
                        return v.strftime("%Y-%m-%d")
                    return v
        return None

    return {
        "order_id": str(order_id),
        "order_date": val(["order_date", "Order Date"]),
        "ship_date": val(["ship_date", "Ship Date"]),
        "segment": val(["segment", "Segment"]),
        "region": val(["region", "Region"]),
        "category": val(["category", "Category"]),
        "sub_category": val(["sub_category", "Sub-Category"]),
        "product_name": val(["product_name", "Product Name"]),
        "quantity": val(["quantity", "Quantity"]),
        "gross_sales": val(["gross_sales"]),
        "discount": val(["discount", "Discount"]),
        "discount_amount": val(["discount_amount"]),
        "net_revenue": val(["net_revenue"]),
        "unit_cost": val(["unit_cost", "Unit Cost"]),
        "cogs": val(["cogs"]),
        "shipping_cost": val(["shipping_cost"]),
        "payment_fee": val(["payment_fee"]),
        "net_profit": val(["net_profit"]),
        "profit_margin": val(["profit_margin"]),
        "loss_cause": val(["loss_cause"]),
        "is_loss": bool(row["is_loss"]) if "is_loss" in match.columns else None,
        "discount_band": val(["discount_band"]),
    }


def filter_options(store: AnalysisStore, session_id: str) -> Dict[str, Any]:
    df = store.get_df(session_id)
    loss_df = df[df["is_loss"]]

    def uniq(colnames):
        col = _col(df, *colnames)
        if col is None:
            return []
        return sorted([str(x) for x in df[col].dropna().unique()])

    date_col = _col(df, "order_date", "Order Date")
    discount_col = _col(df, "discount", "Discount")
    date_min = date_max = None
    if date_col and df[date_col].notna().any():
        date_min = df[date_col].min().strftime("%Y-%m-%d")
        date_max = df[date_col].max().strftime("%Y-%m-%d")

    return {
        "categories": uniq(["category", "Category"]),
        "sub_categories": uniq(["sub_category", "Sub-Category"]),
        "regions": uniq(["region", "Region"]),
        "segments": uniq(["segment", "Segment"]),
        "loss_causes": sorted([str(x) for x in loss_df["loss_cause"].dropna().unique()]) if "loss_cause" in loss_df.columns else [],
        "date_min": date_min,
        "date_max": date_max,
        "discount_max": float(df[discount_col].max()) if discount_col and df[discount_col].notna().any() else None,
    }


# ---------------------------------------------------------------------------
# Products & breakdowns
# ---------------------------------------------------------------------------

def _group_stats(df: pd.DataFrame, col: str) -> pd.DataFrame:
    agg_kwargs: Dict[str, Any] = {
        "orders": ("net_profit", "size"),
        "gross_sales": ("gross_sales", "sum"),
        "net_revenue": ("net_revenue", "sum"),
        "net_profit": ("net_profit", "sum"),
        "loss_orders": ("is_loss", "sum"),
        "avg_order_margin": ("profit_margin", "mean"),
    }
    cat_col = _col(df, "category", "Category")
    subcat_col = _col(df, "sub_category", "Sub-Category")
    if cat_col and cat_col != col:
        agg_kwargs["category"] = (cat_col, "first")
    if subcat_col and subcat_col != col:
        agg_kwargs["sub_category"] = (subcat_col, "first")

    g = df.groupby(col, observed=True).agg(**agg_kwargs).reset_index()
    g["profit_margin"] = g.apply(lambda r: _agg_margin(r.net_profit, r.net_revenue), axis=1)
    return g


def products(
    store: AnalysisStore,
    session_id: str,
    search: str = "",
    category: Optional[str] = None,
    sub_category: Optional[str] = None,
    sort_by: str = "net_profit",
    sort_dir: str = "desc",
    limit: int = 200,
) -> Dict[str, Any]:
    df = store.get_df(session_id)
    product_col = _col(df, "product_name", "Product Name")
    if product_col is None:
        return {"rows": [], "total_products": 0}

    d = df
    cat_col = _col(df, "category", "Category")
    subcat_col = _col(df, "sub_category", "Sub-Category")
    if category and cat_col:
        d = d[d[cat_col].astype(str) == category]
    if sub_category and subcat_col:
        d = d[d[subcat_col].astype(str) == sub_category]
    if search:
        d = d[d[product_col].astype(str).str.contains(search, case=False, na=False)]

    if d.empty:
        return {"rows": [], "total_products": 0}

    g = _group_stats(d, product_col).sort_values(sort_by, ascending=(sort_dir != "desc"))

    def extra(r):
        out = {}
        if subcat_col:
            out["sub_category"] = str(_safe(r.get(subcat_col), "—"))
        if cat_col:
            out["category"] = str(_safe(r.get(cat_col), "—"))
        return out

    rows = [
        ProductRow(
            product_name=str(r[product_col]),
            orders=int(r.orders),
            gross_sales=float(r.gross_sales),
            net_revenue=float(r.net_revenue),
            net_profit=float(r.net_profit),
            profit_margin=float(r.profit_margin),
            avg_order_margin=float(r.avg_order_margin),
            loss_orders=int(r.loss_orders),
            **extra(r),
        )
        for _, r in g.head(limit).iterrows()
    ]
    return {"rows": rows, "total_products": int(g.shape[0])}


def breakdown(store: AnalysisStore, session_id: str, dimension: str) -> List[BreakdownRow]:
    df = store.get_df(session_id)
    col_map = {
        "category": ["category", "Category"],
        "sub_category": ["sub_category", "Sub-Category"],
        "region": ["region", "Region"],
        "segment": ["segment", "Segment"],
    }
    names = col_map.get(dimension)
    if not names:
        return []
    col = _col(df, *names)
    if col is None:
        return []

    g = _group_stats(df, col).sort_values("net_profit", ascending=False)
    return [
        BreakdownRow(
            name=str(r[col]),
            orders=int(r.orders),
            gross_sales=float(r.gross_sales),
            net_revenue=float(r.net_revenue),
            net_profit=float(r.net_profit),
            profit_margin=float(r.profit_margin),
        )
        for _, r in g.iterrows()
    ]