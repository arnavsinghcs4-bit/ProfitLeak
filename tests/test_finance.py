"""
Tests for finance module: vectorized financial calculations.
"""

import pytest
import pandas as pd
import numpy as np
from profitleak.finance import compute_financial_metrics, aggregate_to_order_level
from profitleak.utils import safe_divide_series


@pytest.fixture
def sample_config():
    """Sample configuration for finance calculations."""
    return {
        "columns": {
            "sales": "sales",
            "quantity": "quantity",
            "discount": "discount",
            "unit_cost": "unit_cost",
            "shipping_cost": "shipping_cost",
        },
        "finance": {
            "unit_cost_pct_of_sales": 0.40,
            "shipping_cost_pct_of_sales": 0.10,
            "payment_fee_pct": 0.03,
        },
    }


@pytest.fixture
def hand_calculated_orders():
    """Hand-calculated orders with known profit/margin values (using standard column names)."""
    df = pd.DataFrame({
        "sales": [100.0, 100.0, 100.0],
        "quantity": [1, 1, 1],
        "discount": [0.0, 0.4, 0.2],
        "unit_cost": [40.0, 40.0, 40.0],
        "shipping_cost": [10.0, 10.0, 10.0],
    })
    return df


def test_compute_financial_metrics_basic(hand_calculated_orders, sample_config):
    """Test financial metrics computation with hand-calculated values."""
    df = compute_financial_metrics(hand_calculated_orders.copy(), sample_config)

    # Order 1: No discount
    assert df["gross_sales"].iloc[0] == 100.0
    assert df["discount_amount"].iloc[0] == 0.0
    assert df["net_revenue"].iloc[0] == 100.0
    assert df["cogs"].iloc[0] == 40.0
    assert df["shipping_cost"].iloc[0] == 10.0
    assert df["payment_fee"].iloc[0] == pytest.approx(3.0)
    assert df["net_profit"].iloc[0] == pytest.approx(47.0)
    assert df["profit_margin"].iloc[0] == pytest.approx(0.47)
    assert bool(df["is_loss"].iloc[0]) == False

    # Order 2: 40% discount (barely profitable)
    assert df["discount_amount"].iloc[1] == 40.0
    assert df["net_revenue"].iloc[1] == 60.0
    assert df["net_profit"].iloc[1] == pytest.approx(8.2, abs=0.1)
    assert bool(df["is_loss"].iloc[1]) == False

    # Order 3: 20% discount (profitable)
    assert df["net_revenue"].iloc[2] == 80.0
    assert df["net_profit"].iloc[2] == pytest.approx(27.6, abs=0.1)
    assert bool(df["is_loss"].iloc[2]) == False


def test_safe_divide_with_zero_revenue():
    """Test safe division when revenue is zero (should return fill_value)."""
    numerator = pd.Series([100.0, 0.0, 50.0])
    denominator = pd.Series([10.0, 0.0, 10.0])

    result = safe_divide_series(numerator, denominator, fill_value=0.0)

    assert result.iloc[0] == 10.0
    assert result.iloc[1] == 0.0  # 0/0 → fill_value
    assert result.iloc[2] == 5.0


def test_compute_financial_metrics_with_missing_unit_cost(sample_config):
    """Test that missing Unit Cost is estimated as percentage of sales."""
    df = pd.DataFrame({
        "sales": [100.0, 200.0],
        "quantity": [1, 2],
        "discount": [0.1, 0.2],
        "unit_cost": [np.nan, np.nan],  # Missing
        "shipping_cost": [5.0, 15.0],
    })

    df_computed = compute_financial_metrics(df.copy(), sample_config)

    # COGS should be estimated as 40% of sales
    assert df_computed["cogs"].iloc[0] == pytest.approx(40.0, abs=0.1)  # 40% * 100
    assert df_computed["cogs"].iloc[1] == pytest.approx(80.0, abs=0.1)  # 40% * 200


def test_compute_financial_metrics_with_missing_shipping_cost(sample_config):
    """Test that missing Shipping Cost is estimated as percentage of sales."""
    df = pd.DataFrame({
        "sales": [100.0, 200.0],
        "quantity": [1, 2],
        "discount": [0.1, 0.2],
        "unit_cost": [40.0, 80.0],
        "shipping_cost": [np.nan, np.nan],  # Missing
    })

    df_computed = compute_financial_metrics(df.copy(), sample_config)

    # Shipping should be estimated as 10% of sales
    assert df_computed["shipping_cost"].iloc[0] == pytest.approx(10.0, abs=0.1)
    assert df_computed["shipping_cost"].iloc[1] == pytest.approx(20.0, abs=0.1)


def test_aggregate_to_order_level():
    """Test aggregation of multi-line orders to order level."""
    df = pd.DataFrame({
        "Order ID": ["ORD-001", "ORD-001", "ORD-002"],
        "gross_sales": [50.0, 50.0, 100.0],
        "discount_amount": [5.0, 5.0, 10.0],
        "net_revenue": [45.0, 45.0, 90.0],
        "cogs": [20.0, 20.0, 40.0],
        "shipping_cost": [5.0, 5.0, 10.0],
        "payment_fee": [1.35, 1.35, 2.7],
        "net_profit": [17.65, 17.65, 37.3],
    })

    df_agg = aggregate_to_order_level(df, "Order ID")

    # ORD-001 should be aggregated
    assert len(df_agg) == 2

    # First order (ORD-001) aggregation
    ord001 = df_agg[df_agg["Order ID"] == "ORD-001"].iloc[0]
    assert ord001["gross_sales"] == 100.0  # 50 + 50
    assert ord001["net_profit"] == pytest.approx(35.3)  # 17.65 + 17.65
    assert ord001["profit_margin"] == pytest.approx(0.3922, abs=0.01)  # 35.3 / 90
    assert bool(ord001["is_loss"]) == False

    # Second order (ORD-002)
    ord002 = df_agg[df_agg["Order ID"] == "ORD-002"].iloc[0]
    assert ord002["gross_sales"] == 100.0
    assert ord002["net_profit"] == pytest.approx(37.3)
    assert ord002["profit_margin"] == pytest.approx(0.414, abs=0.01)


def test_loss_flag_computation():
    """Test that loss flag is correctly computed."""
    df = pd.DataFrame({
        "sales": [100.0, 100.0, 100.0],
        "quantity": [1, 1, 1],
        "discount": [0.0, 0.8, 0.2],  # 80% discount causes loss
        "unit_cost": [40.0, 40.0, 40.0],
        "shipping_cost": [10.0, 10.0, 10.0],
    })

    config = {
        "columns": {
            "sales": "sales",
            "quantity": "quantity",
            "discount": "discount",
            "unit_cost": "unit_cost",
            "shipping_cost": "shipping_cost",
        },
        "finance": {
            "unit_cost_pct_of_sales": 0.40,
            "shipping_cost_pct_of_sales": 0.10,
            "payment_fee_pct": 0.0,
        },
    }

    df_computed = compute_financial_metrics(df.copy(), config)

    # First order: profit (no discount)
    assert bool(df_computed["is_loss"].iloc[0]) == False
    # Second order: loss (80% discount)
    assert bool(df_computed["is_loss"].iloc[1]) == True
    # Third order: profit (20% discount)
    assert bool(df_computed["is_loss"].iloc[2]) == False
