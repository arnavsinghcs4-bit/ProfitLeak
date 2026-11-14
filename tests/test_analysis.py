"""
Tests for analysis module: pivots, loss detection, discount threshold analysis.
"""

import pytest
import pandas as pd
import numpy as np
from profitleak.analysis import (
    tag_loss_causes, detect_loss_orders, detect_breakeven_discount,
    compute_pivot_tables, rank_top_performers
)


@pytest.fixture
def sample_config():
    """Sample configuration for analysis."""
    return {
        "analysis": {
            "discount_loss_threshold": 0.30,
            "shipping_loss_threshold": 0.15,
        },
        "reporting": {
            "top_n_products": 10,
        },
    }


@pytest.fixture
def sample_df_with_metrics():
    """DataFrame with financial metrics and features."""
    df = pd.DataFrame({
        "Order ID": ["ORD-001", "ORD-002", "ORD-003", "ORD-004"],
        "Category": ["Tech", "Tech", "Furniture", "Furniture"],
        "Region": ["East", "West", "East", "West"],
        "Product Name": ["Laptop", "Phone", "Chair", "Desk"],
        "Segment": ["Corporate", "Consumer", "Corporate", "Consumer"],
        "discount": [0.0, 0.4, 0.2, 0.05],
        "net_revenue": [1000.0, 600.0, 800.0, 950.0],
        "net_profit": [300.0, -200.0, 100.0, 250.0],
        "shipping_cost": [50.0, 100.0, 60.0, 40.0],
        "is_loss": [False, True, False, False],
        "profit_margin": [0.30, -0.333, 0.125, 0.263],
        "gross_sales": [1100.0, 1000.0, 1000.0, 1000.0],
    })
    return df


def test_tag_loss_causes_discount_driven(sample_df_with_metrics, sample_config):
    """Test that high-discount losses are tagged as discount-driven or Both."""
    df = sample_df_with_metrics.copy()
    df = tag_loss_causes(df, sample_config)

    # ORD-002 has discount=0.4 (>0.30) and is a loss
    loss_cause = df[df["Order ID"] == "ORD-002"]["loss_cause"].iloc[0]
    assert loss_cause in ["Discount-driven", "Both"]


def test_tag_loss_causes_profitable(sample_df_with_metrics, sample_config):
    """Test that profitable orders are tagged as profitable."""
    df = sample_df_with_metrics.copy()
    df = tag_loss_causes(df, sample_config)

    # ORD-001 is not a loss
    assert df[df["Order ID"] == "ORD-001"]["loss_cause"].iloc[0] == "Profitable"
    assert df[df["Order ID"] == "ORD-003"]["loss_cause"].iloc[0] == "Profitable"
    assert df[df["Order ID"] == "ORD-004"]["loss_cause"].iloc[0] == "Profitable"


def test_detect_loss_orders(sample_df_with_metrics):
    """Test loss order detection and ranking by loss size."""
    loss_df = detect_loss_orders(sample_df_with_metrics.copy())

    # Only ORD-002 is a loss
    assert len(loss_df) == 1
    assert loss_df["Order ID"].iloc[0] == "ORD-002"
    assert loss_df["net_profit"].iloc[0] == -200.0


def test_detect_breakeven_discount():
    """Test breakeven discount detection with synthetic linear data."""
    # Create synthetic data where margin decreases linearly with discount
    # margin = 0.5 - 0.5*discount (breakeven at discount=1.0)
    discounts = np.array([0.0, 0.2, 0.4, 0.6, 0.8, 1.0])
    margins = 0.5 - 0.5 * discounts
    revenues = np.ones_like(discounts) * 100  # Constant revenue for simplicity

    df = pd.DataFrame({
        "discount": discounts,
        "profit_margin": margins,
        "net_revenue": revenues,
        "Category": ["Tech"] * len(discounts),
    })

    config = {
        "analysis": {
            "discount_loss_threshold": 0.30,
            "shipping_loss_threshold": 0.15,
        },
    }

    results = detect_breakeven_discount(df, config)

    # Should detect breakeven discount near 1.0
    assert "overall_breakeven_discount" in results
    breakeven = results["overall_breakeven_discount"]
    assert breakeven is not None
    assert 0.9 <= breakeven <= 1.0  # Close to 1.0


def test_detect_breakeven_discount_realistic():
    """Test breakeven discount detection on realistic data."""
    # margin = 0.4 - 0.6*discount (breakeven at discount=2/3 ≈ 0.667)
    discounts = np.linspace(0, 1, 50)
    margins = 0.4 - 0.6 * discounts

    df = pd.DataFrame({
        "discount": discounts,
        "profit_margin": margins,
        "net_revenue": np.ones_like(discounts) * 100,
    })

    config = {"analysis": {"discount_loss_threshold": 0.30, "shipping_loss_threshold": 0.15}}
    results = detect_breakeven_discount(df, config)

    breakeven = results["overall_breakeven_discount"]
    assert breakeven is not None
    # Should be close to 0.667
    assert 0.65 <= breakeven <= 0.68


def test_compute_pivot_tables(sample_df_with_metrics):
    """Test pivot table computation."""
    df = sample_df_with_metrics.copy()
    df["order_month"] = [1, 1, 2, 2]  # Add month column
    df["discount_band"] = pd.cut(df["discount"], bins=[0, 0.1, 0.3, 1.0], labels=["Low", "Med", "High"])

    pivots = compute_pivot_tables(df)

    # Should have at least category_region_profit and category_region_margin
    assert "category_region_profit" in pivots
    assert "category_region_margin" in pivots


def test_rank_top_performers(sample_df_with_metrics):
    """Test ranking of top performers."""
    df = sample_df_with_metrics.copy()

    config = {
        "reporting": {
            "top_n_products": 10,
        },
    }

    rankings = rank_top_performers(df, config)

    # Should have at least top_products ranking
    assert "top_products" in rankings
    top_products = rankings["top_products"]

    # Laptop (300 profit) should rank higher than Phone (-200 profit)
    laptop_idx = top_products.index.get_loc("Laptop") if "Laptop" in top_products.index else None
    phone_idx = top_products.index.get_loc("Phone") if "Phone" in top_products.index else None

    if laptop_idx is not None and phone_idx is not None:
        # In a "top" ranking sorted descending, lower index = higher rank
        assert laptop_idx < phone_idx
