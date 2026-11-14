"""
Generate realistic synthetic e-commerce order data for testing.
Creates ~10,000 orders with planted loss-making behavior.
Fixed random seed for reproducibility.
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Fixed seed for reproducibility
np.random.seed(42)

def generate_synthetic_data(n_orders: int = 10000, output_path: str = None) -> pd.DataFrame:
    """
    Generate synthetic Superstore-style order data with realistic loss patterns.

    Args:
        n_orders: Number of orders to generate
        output_path: Optional path to save CSV

    Returns:
        DataFrame with columns: Order ID, Order Date, Ship Date, Segment, Region,
        Category, Sub-Category, Product Name, Sales, Quantity, Discount, Profit,
        Unit Cost, Shipping Cost, Returned
    """

    # Realistic product catalog
    categories = ["Technology", "Furniture", "Office Supplies"]

    subcategories = {
        "Technology": ["Phones", "Copiers", "Machines", "Accessories"],
        "Furniture": ["Bookcases", "Chairs", "Tables", "Furnishings"],
        "Office Supplies": ["Binders", "Art Supplies", "Fasteners", "Labels"],
    }

    segments = ["Consumer", "Corporate", "Home Office"]
    regions = ["Central", "East", "South", "West"]

    # Generate base order dates spread over 4 years
    start_date = datetime(2020, 1, 1)
    date_range = 365 * 4
    order_dates = [start_date + timedelta(days=int(x))
                   for x in np.random.randint(0, date_range, n_orders)]

    # Initialize data
    data = {
        "Order ID": [f"ORD-{i:06d}" for i in range(n_orders)],
        "Order Date": order_dates,
        "Ship Date": [d + timedelta(days=int(x))
                      for d, x in zip(order_dates, np.random.randint(1, 15, n_orders))],
        "Segment": np.random.choice(segments, n_orders),
        "Region": np.random.choice(regions, n_orders),
        "Category": np.random.choice(categories, n_orders),
        "Quantity": np.random.randint(1, 20, n_orders),
    }

    # Assign Sub-Category based on Category
    subcats = [
        np.random.choice(subcategories[cat])
        for cat in data["Category"]
    ]
    data["Sub-Category"] = subcats

    # Product names (simplified)
    data["Product Name"] = [
        f"{subcat} - Product {np.random.randint(1, 100)}"
        for subcat in subcats
    ]

    # Unit Cost (as % of list price; typically 40-60%)
    unit_cost_pcts = np.random.uniform(0.35, 0.65, n_orders)

    # List price (Sales per unit, ranges $10-$500)
    list_prices = np.random.lognormal(mean=3.5, sigma=1.5, size=n_orders)
    list_prices = np.clip(list_prices, 10, 500)

    # Gross Sales = Quantity * List Price
    data["Sales"] = data["Quantity"] * list_prices

    # Unit Cost
    data["Unit Cost"] = unit_cost_pcts * list_prices

    # Discount: apply realistic distribution with some heavy discounts
    # Most orders: 0-10%, some: 10-30%, a few: 30-50% (loss-makers)
    discount_tiers = np.random.choice([0, 1, 2], n_orders, p=[0.60, 0.30, 0.10])
    discounts = np.where(
        discount_tiers == 0,
        np.random.uniform(0.00, 0.10, n_orders),  # 0-10%
        np.where(
            discount_tiers == 1,
            np.random.uniform(0.10, 0.30, n_orders),  # 10-30%
            np.random.uniform(0.30, 0.50, n_orders),  # 30-50% (heavy)
        ),
    )
    data["Discount"] = discounts

    # Discount Amount
    discount_amount = data["Sales"] * data["Discount"]

    # Net Revenue
    net_revenue = data["Sales"] - discount_amount

    # COGS
    cogs = data["Quantity"] * data["Unit Cost"]

    # Shipping Cost (as % of gross sales; typically 8-15%)
    # Heavy shipping on light items causes losses
    shipping_pcts = np.random.uniform(0.08, 0.15, n_orders)
    data["Shipping Cost"] = data["Sales"] * shipping_pcts

    # Profit (simplified: no payment fees or return costs in this version)
    data["Profit"] = net_revenue - cogs - data["Shipping Cost"]

    # Returned orders (mark a small percentage)
    data["Returned"] = np.random.choice(["No", "Yes"], n_orders, p=[0.95, 0.05])

    df = pd.DataFrame(data)

    logger.info(f"Generated {n_orders} synthetic orders")
    logger.info(f"  - Order date range: {df['Order Date'].min()} to {df['Order Date'].max()}")
    logger.info(f"  - Total Gross Sales: ${df['Sales'].sum():,.2f}")
    logger.info(f"  - Total Net Profit: ${df['Profit'].sum():,.2f}")
    logger.info(f"  - Loss-making orders: {(df['Profit'] < 0).sum()} ({(df['Profit'] < 0).sum() / len(df) * 100:.1f}%)")
    logger.info(f"  - Avg Discount: {df['Discount'].mean() * 100:.1f}%")

    if output_path:
        df.to_csv(output_path, index=False)
        logger.info(f"Saved to {output_path}")

    return df


if __name__ == "__main__":
    import sys
    output_path = sys.argv[1] if len(sys.argv) > 1 else "data/raw/sample_orders.csv"
    generate_synthetic_data(n_orders=10000, output_path=output_path)
