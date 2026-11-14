"""
Finance module: Vectorized financial calculations (revenue, COGS, profit, margin).
"""

import logging
from typing import Dict, Any
import pandas as pd
import numpy as np
from profitleak.utils import get_logger, safe_divide_series

logger = get_logger()


def compute_financial_metrics(df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
    """
    Compute financial metrics: gross sales, discount amount, net revenue, COGS, profit, margin.

    Note: After main.py renames columns, DataFrame uses standard names (keys) like "sales", "discount"

    Args:
        df: DataFrame with order data (columns already renamed to standard keys)
        config: Configuration dictionary

    Returns:
        DataFrame with financial metrics added
    """
    df = df.copy()

    # After column remapping in main.py, use the standard KEY names
    sales_col = "sales"
    quantity_col = "quantity"
    discount_col = "discount"
    unit_cost_col = "unit_cost"
    shipping_cost_col = "shipping_cost"

    # Finance config
    finance = config.get("finance", {})
    unit_cost_pct = finance.get("unit_cost_pct_of_sales", 0.40)
    shipping_cost_pct = finance.get("shipping_cost_pct_of_sales", 0.10)
    payment_fee_pct = finance.get("payment_fee_pct", 0.0)

    # Gross Sales (already in data)
    df['gross_sales'] = df[sales_col] if sales_col in df.columns else 0

    # Discount Amount
    if discount_col in df.columns:
        df['discount_amount'] = df['gross_sales'] * df[discount_col]
    else:
        df['discount_amount'] = 0

    # Net Revenue
    df['net_revenue'] = df['gross_sales'] - df['discount_amount']

    # COGS (use Unit Cost if available, else estimate)
    if unit_cost_col in df.columns and df[unit_cost_col].notna().any():
        df['cogs'] = df[quantity_col] * df[unit_cost_col]
    else:
        df['cogs'] = df['gross_sales'] * unit_cost_pct
        logger.info(f"Unit Cost missing; estimated COGS as {unit_cost_pct*100:.0f}% of sales")

    # Shipping Cost (use if available, else estimate)
    if shipping_cost_col in df.columns and df[shipping_cost_col].notna().any():
        df['shipping_cost'] = df[shipping_cost_col]
    else:
        df['shipping_cost'] = df['gross_sales'] * shipping_cost_pct
        logger.info(f"Shipping Cost missing; estimated as {shipping_cost_pct*100:.0f}% of gross sales")

    # Payment Fees (optional)
    df['payment_fee'] = df['net_revenue'] * payment_fee_pct if payment_fee_pct > 0 else 0

    # Net Profit
    df['net_profit'] = df['net_revenue'] - df['cogs'] - df['shipping_cost'] - df['payment_fee']

    # Profit Margin (safe divide)
    df['profit_margin'] = safe_divide_series(df['net_profit'], df['net_revenue'], fill_value=0.0)

    # Loss Flag
    df['is_loss'] = df['net_profit'] < 0

    logger.info("Computed financial metrics (vectorized)")

    return df


def aggregate_to_order_level(df: pd.DataFrame, order_id_col: str) -> pd.DataFrame:
    """
    Aggregate line-item data to order level (sum revenues/costs, compute margins).

    Args:
        df: DataFrame with line items (may have multiple lines per order)
        order_id_col: Name of order ID column

    Returns:
        Order-level DataFrame
    """
    agg_funcs = {
        'gross_sales': 'sum',
        'discount_amount': 'sum',
        'net_revenue': 'sum',
        'cogs': 'sum',
        'shipping_cost': 'sum',
        'payment_fee': 'sum',
        'net_profit': 'sum',
    }

    # Group by order ID and aggregate
    order_df = df.groupby(order_id_col).agg(agg_funcs).reset_index()

    # Recompute margin at order level
    order_df['profit_margin'] = safe_divide_series(
        order_df['net_profit'],
        order_df['net_revenue'],
        fill_value=0.0
    )

    order_df['is_loss'] = order_df['net_profit'] < 0

    return order_df
