"""
Tests for clean module: deduplication, null handling, type coercion, clipping.
"""

import pytest
import pandas as pd
import numpy as np
from profitleak.clean import clean_data, coerce_dates, coerce_numerics, clip_discount_values


@pytest.fixture
def sample_config():
    """Sample configuration for cleaning."""
    return {
        "columns": {
            "order_id": "Order ID",
            "order_date": "Order Date",
            "sales": "Sales",
            "quantity": "Quantity",
            "discount": "Discount",
            "returned": "Returned",
        },
        "cleaning": {
            "remove_duplicates": True,
            "exclude_returned_orders": True,
            "discount_range": [0, 1],
        },
    }


@pytest.fixture
def sample_df_with_duplicates():
    """DataFrame with duplicates."""
    df = pd.DataFrame({
        "Order ID": ["ORD-001", "ORD-002", "ORD-001"],
        "Sales": [100.0, 200.0, 100.0],
        "Quantity": [1, 2, 1],
    })
    return df


@pytest.fixture
def sample_df_with_returns():
    """DataFrame with returned orders."""
    df = pd.DataFrame({
        "Order ID": ["ORD-001", "ORD-002", "ORD-003"],
        "Sales": [100.0, 200.0, 150.0],
        "Returned": ["No", "Yes", "No"],
    })
    return df


def test_clean_data_removes_duplicates(sample_df_with_duplicates, sample_config):
    """Test that clean_data removes duplicates."""
    df_cleaned, quality = clean_data(sample_df_with_duplicates, sample_config)
    assert len(df_cleaned) == 2
    assert "duplicates" in quality["rows_dropped"]
    assert quality["rows_dropped"]["duplicates"] == 1


def test_clean_data_excludes_returned(sample_df_with_returns, sample_config):
    """Test that clean_data excludes returned orders."""
    df_cleaned, quality = clean_data(sample_df_with_returns, sample_config)
    assert len(df_cleaned) == 2
    assert "returned" in quality["rows_dropped"]
    assert quality["rows_dropped"]["returned"] == 1


def test_coerce_dates():
    """Test date coercion."""
    df = pd.DataFrame({
        "Order Date": ["2020-01-01", "2020-01-02", "invalid"],
    })
    df_coerced = coerce_dates(df, ["Order Date"])
    # Check that it's a datetime type (pandas may use datetime64[us] or datetime64[ns])
    assert pd.api.types.is_datetime64_any_dtype(df_coerced["Order Date"])
    # Invalid date should be NaT
    assert pd.isna(df_coerced["Order Date"].iloc[2])


def test_coerce_numerics():
    """Test numeric coercion."""
    df = pd.DataFrame({
        "Sales": ["100.5", "200.3", "invalid"],
    })
    df_coerced = coerce_numerics(df, ["Sales"])
    assert df_coerced["Sales"].dtype == "float64"
    assert df_coerced["Sales"].iloc[0] == 100.5
    # Invalid value should be NaN
    assert pd.isna(df_coerced["Sales"].iloc[2])


def test_clip_discount_values():
    """Test discount clipping to [0, 1] range."""
    df = pd.DataFrame({
        "Discount": [-0.1, 0.3, 1.5, 0.5],
    })
    df_clipped = clip_discount_values(df, "Discount", [0, 1])
    # Check clipping
    assert df_clipped["Discount"].iloc[0] == 0.0  # -0.1 → 0
    assert df_clipped["Discount"].iloc[1] == 0.3  # unchanged
    assert df_clipped["Discount"].iloc[2] == 1.0  # 1.5 → 1
    assert df_clipped["Discount"].iloc[3] == 0.5  # unchanged
