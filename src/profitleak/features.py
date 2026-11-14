"""
Features module: Temporal and categorical feature engineering.
"""

import logging
from typing import Dict, Any
import pandas as pd
import numpy as np
from profitleak.utils import get_logger

logger = get_logger()


def engineer_temporal_features(df: pd.DataFrame, order_date_col: str,
                                ship_date_col: str) -> pd.DataFrame:
    """
    Engineer temporal features: year, quarter, month, weekday, days_to_ship.

    Args:
        df: DataFrame with date columns
        order_date_col: Name of order date column
        ship_date_col: Name of ship date column

    Returns:
        DataFrame with temporal features added
    """
    df = df.copy()

    if order_date_col in df.columns:
        df['order_year'] = df[order_date_col].dt.year
        df['order_quarter'] = df[order_date_col].dt.quarter
        df['order_month'] = df[order_date_col].dt.month
        df['order_month_name'] = df[order_date_col].dt.strftime('%B')
        df['order_weekday'] = df[order_date_col].dt.day_name()
        df['order_week'] = df[order_date_col].dt.isocalendar().week

    if order_date_col in df.columns and ship_date_col in df.columns:
        df['days_to_ship'] = (df[ship_date_col] - df[order_date_col]).dt.days

    return df


def engineer_discount_bands(df: pd.DataFrame, discount_col: str,
                            config: Dict[str, Any]) -> pd.DataFrame:
    """
    Engineer discount band categories using pd.cut.

    Args:
        df: DataFrame with discount column
        discount_col: Name of discount column
        config: Configuration with discount_bands and labels

    Returns:
        DataFrame with discount_band column added
    """
    df = df.copy()

    if discount_col in df.columns:
        bands = config.get("features", {}).get("discount_bands", [0, 0.01, 0.11, 0.21, 0.31, 0.41, 1.0])
        labels = config.get("features", {}).get("discount_band_labels", ["0%", "1-10%", "11-20%", "21-30%", "31-40%", "41%+"])

        df['discount_band'] = pd.cut(df[discount_col], bins=bands, labels=labels, include_lowest=True)

    return df


def engineer_order_size_tiers(df: pd.DataFrame, sales_col: str) -> pd.DataFrame:
    """
    Engineer order size tiers (Small, Medium, Large) using quantiles.

    Args:
        df: DataFrame with sales column
        sales_col: Name of sales column

    Returns:
        DataFrame with order_size_tier column added
    """
    df = df.copy()

    if sales_col in df.columns:
        q33, q66 = df[sales_col].quantile([0.33, 0.66])
        df['order_size_tier'] = pd.cut(
            df[sales_col],
            bins=[0, q33, q66, float('inf')],
            labels=['Small', 'Medium', 'Large'],
            include_lowest=True
        )

    return df
