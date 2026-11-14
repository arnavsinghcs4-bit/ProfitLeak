"""
Analysis module: Pivots, loss detection, discount threshold analysis, top performers.
"""

import logging
from typing import Dict, Any, Tuple
import pandas as pd
import numpy as np
from profitleak.utils import get_logger, safe_divide_series

logger = get_logger()


def tag_loss_causes(df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
    """
    Tag loss-making orders with their cause: discount-driven, shipping-driven, both, cost-driven.
    Uses np.select for vectorized tagging.

    Args:
        df: DataFrame with financial metrics
        config: Configuration dictionary

    Returns:
        DataFrame with loss_cause column added
    """
    df = df.copy()

    analysis = config.get("analysis", {})
    discount_threshold = analysis.get("discount_loss_threshold", 0.30)
    shipping_threshold = analysis.get("shipping_loss_threshold", 0.15)

    # Get discount column (handle both 'discount' and 'Discount')
    discount_col = 'discount' if 'discount' in df.columns else 'Discount'

    # Compute shipping as % of revenue
    shipping_pct = safe_divide_series(df['shipping_cost'], df['net_revenue'], fill_value=0.0)

    # Define conditions
    conditions = [
        df['is_loss'] == False,  # Not a loss
        (df['is_loss']) & (df[discount_col] >= discount_threshold) & (shipping_pct >= shipping_threshold),  # Both
        (df['is_loss']) & (df[discount_col] >= discount_threshold),  # Discount-driven
        (df['is_loss']) & (shipping_pct >= shipping_threshold),  # Shipping-driven
        df['is_loss'],  # Cost-driven (default for remaining losses)
    ]

    choices = ['Profitable', 'Both', 'Discount-driven', 'Shipping-driven', 'Cost-driven']

    df['loss_cause'] = np.select(conditions, choices, default='Unknown')

    return df


def detect_loss_orders(df: pd.DataFrame) -> pd.DataFrame:
    """
    Detect and rank loss-making orders by loss size.

    Args:
        df: DataFrame with financial metrics

    Returns:
        Sorted DataFrame of loss orders
    """
    loss_df = df[df['is_loss']].copy()
    loss_df = loss_df.sort_values('net_profit')

    logger.info(f"Detected {len(loss_df)} loss-making orders ({len(loss_df)/len(df)*100:.1f}% of total)")

    return loss_df


def detect_breakeven_discount(df: pd.DataFrame, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Detect discount threshold at which orders become unprofitable.
    Fits np.polyfit(discount, margin, 1) and solves for margin=0.
    Also computes per-category breakeven.

    Args:
        df: DataFrame with financial metrics
        config: Configuration dictionary

    Returns:
        Dictionary with breakeven results
    """
    results = {}

    # Get discount column
    discount_col = 'discount' if 'discount' in df.columns else 'Discount'

    # Overall breakeven
    discount_vals = df[discount_col].values
    margin_vals = df['profit_margin'].values

    # Remove NaN and inf values
    mask = np.isfinite(margin_vals) & np.isfinite(discount_vals)
    discount_clean = discount_vals[mask]
    margin_clean = margin_vals[mask]

    if len(discount_clean) > 1:
        # Fit linear regression
        coeffs = np.polyfit(discount_clean, margin_clean, 1)  # [slope, intercept]
        slope, intercept = coeffs[0], coeffs[1]

        # Solve for margin = 0: slope * discount + intercept = 0
        if abs(slope) > 1e-6:  # Avoid division by zero
            breakeven_discount = -intercept / slope
            breakeven_discount = np.clip(breakeven_discount, 0, 1)
        else:
            breakeven_discount = None

        results['overall_breakeven_discount'] = breakeven_discount
        results['fit_slope'] = slope
        results['fit_intercept'] = intercept

    # Per-category breakeven
    category_col = 'Category' if 'Category' in df.columns else None
    if category_col:
        category_breakevens = {}
        for cat in df[category_col].unique():
            cat_df = df[df[category_col] == cat]
            discount_cat = cat_df[discount_col].values
            margin_cat = cat_df['profit_margin'].values

            mask_cat = np.isfinite(margin_cat) & np.isfinite(discount_cat)
            if mask_cat.sum() > 1:
                discount_cat_clean = discount_cat[mask_cat]
                margin_cat_clean = margin_cat[mask_cat]

                coeffs_cat = np.polyfit(discount_cat_clean, margin_cat_clean, 1)
                slope_cat, intercept_cat = coeffs_cat[0], coeffs_cat[1]

                if abs(slope_cat) > 1e-6:
                    be_cat = -intercept_cat / slope_cat
                    be_cat = np.clip(be_cat, 0, 1)
                    category_breakevens[cat] = be_cat

        results['category_breakevens'] = category_breakevens

    logger.info(f"Computed breakeven discount: {results.get('overall_breakeven_discount', 'N/A')}")

    return results


def compute_pivot_tables(df: pd.DataFrame) -> Dict[str, pd.DataFrame]:
    """
    Compute pivot tables: Category x Region, Sub-Category x Month, Segment x Discount Band.

    Args:
        df: DataFrame with financial metrics and features

    Returns:
        Dictionary of pivot tables
    """
    pivots = {}

    # Category x Region (profit and margin) - handle both original and remapped names
    category_col = 'Category' if 'Category' in df.columns else 'category'
    region_col = 'Region' if 'Region' in df.columns else 'region'

    if category_col in df.columns and region_col in df.columns:
        try:
            pivots['category_region_profit'] = df.pivot_table(
                values='net_profit', index=category_col, columns=region_col, aggfunc='sum'
            )
            pivots['category_region_margin'] = df.pivot_table(
                values='profit_margin', index=category_col, columns=region_col, aggfunc='mean'
            )
        except Exception as e:
            logger.debug(f"Could not create category_region pivots: {e}")

    # Sub-Category x Month
    subcat_col = 'Sub-Category' if 'Sub-Category' in df.columns else 'sub_category'
    month_col = 'order_month' if 'order_month' in df.columns else None

    if subcat_col in df.columns and month_col and month_col in df.columns:
        try:
            pivots['subcategory_month'] = df.pivot_table(
                values='net_profit', index=subcat_col, columns=month_col, aggfunc='sum'
            )
        except Exception as e:
            logger.debug(f"Could not create subcategory_month pivot: {e}")

    # Segment x Discount Band
    segment_col = 'Segment' if 'Segment' in df.columns else 'segment'
    discount_band_col = 'discount_band' if 'discount_band' in df.columns else None

    if segment_col in df.columns and discount_band_col and discount_band_col in df.columns:
        try:
            pivots['segment_discount_band'] = df.pivot_table(
                values='net_profit', index=segment_col, columns=discount_band_col, aggfunc='sum'
            )
        except Exception as e:
            logger.debug(f"Could not create segment_discount_band pivot: {e}")

    logger.info(f"Computed {len(pivots)} pivot tables")

    return pivots


def rank_top_performers(df: pd.DataFrame, config: Dict[str, Any]) -> Dict[str, pd.DataFrame]:
    """
    Rank products, sub-categories, categories, segments by profit, margin, profit per order.
    Include gross vs net comparison.

    Args:
        df: DataFrame with financial metrics
        config: Configuration dictionary

    Returns:
        Dictionary of ranking DataFrames
    """
    top_n = config.get("reporting", {}).get("top_n_products", 10)

    rankings = {}

    # By Product
    product_col = 'Product Name' if 'Product Name' in df.columns else 'product_name'
    if product_col in df.columns:
        try:
            product_stats = df.groupby(product_col).agg({
                'net_profit': ['sum', 'mean'],
                'profit_margin': 'mean',
                'gross_sales': 'sum',
            }).round(2)
            product_stats.columns = ['Total Profit', 'Avg Profit', 'Avg Margin', 'Gross Sales']
            rankings['top_products'] = product_stats.sort_values('Total Profit', ascending=False).head(top_n)
        except Exception as e:
            logger.debug(f"Could not rank products: {e}")

    # By Sub-Category
    subcat_col = 'Sub-Category' if 'Sub-Category' in df.columns else 'sub_category'
    if subcat_col in df.columns:
        try:
            subcat_stats = df.groupby(subcat_col).agg({
                'net_profit': ['sum', 'mean'],
                'profit_margin': 'mean',
                'gross_sales': 'sum',
            }).round(2)
            subcat_stats.columns = ['Total Profit', 'Avg Profit', 'Avg Margin', 'Gross Sales']
            rankings['top_subcategories'] = subcat_stats.sort_values('Total Profit', ascending=False).head(top_n)
        except Exception as e:
            logger.debug(f"Could not rank sub-categories: {e}")

    # By Category
    category_col = 'Category' if 'Category' in df.columns else 'category'
    if category_col in df.columns:
        try:
            cat_stats = df.groupby(category_col).agg({
                'net_profit': ['sum', 'mean'],
                'profit_margin': 'mean',
                'gross_sales': 'sum',
            }).round(2)
            cat_stats.columns = ['Total Profit', 'Avg Profit', 'Avg Margin', 'Gross Sales']
            rankings['categories'] = cat_stats.sort_values('Total Profit', ascending=False)
        except Exception as e:
            logger.debug(f"Could not rank categories: {e}")

    # By Segment
    segment_col = 'Segment' if 'Segment' in df.columns else 'segment'
    if segment_col in df.columns:
        try:
            seg_stats = df.groupby(segment_col).agg({
                'net_profit': ['sum', 'mean'],
                'profit_margin': 'mean',
                'gross_sales': 'sum',
            }).round(2)
            seg_stats.columns = ['Total Profit', 'Avg Profit', 'Avg Margin', 'Gross Sales']
            rankings['segments'] = seg_stats.sort_values('Total Profit', ascending=False)
        except Exception as e:
            logger.debug(f"Could not rank segments: {e}")

    logger.info(f"Computed {len(rankings)} ranking tables")

    return rankings
