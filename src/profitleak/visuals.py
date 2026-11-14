"""
Visuals module: Charts and dashboards using seaborn/matplotlib.
"""

import logging
from typing import Dict, Any
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from profitleak.utils import get_logger

logger = get_logger()


def setup_plot_style() -> None:
    """Set up consistent plot styling."""
    sns.set_theme(style="whitegrid")
    plt.rcParams['figure.dpi'] = 150
    plt.rcParams['font.size'] = 10
    logger.debug("Plot style configured")


def plot_margin_heatmap(df: pd.DataFrame, output_path: str = None) -> None:
    """Plot heatmap of margin by Category x Region."""
    if 'Category' not in df.columns or 'Region' not in df.columns:
        logger.warning("Cannot plot margin heatmap: missing Category or Region columns")
        return

    pivot = df.pivot_table(values='profit_margin', index='Category', columns='Region', aggfunc='mean')

    fig, ax = plt.subplots(figsize=(8, 6))
    sns.heatmap(pivot, annot=True, fmt='.2%', cmap='RdYlGn', center=0, ax=ax, cbar_kws={'label': 'Profit Margin'})
    ax.set_title('Profit Margin by Category and Region')

    if output_path:
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        logger.info(f"Saved margin heatmap to {output_path}")
    plt.close()


def plot_revenue_vs_profit(df: pd.DataFrame, output_path: str = None) -> None:
    """Plot monthly net revenue vs net profit line chart."""
    if 'order_month' not in df.columns:
        logger.warning("Cannot plot revenue vs profit: missing order_month column")
        return

    monthly = df.groupby('order_month').agg({
        'net_revenue': 'sum',
        'net_profit': 'sum',
    }).reset_index()

    fig, ax = plt.subplots(figsize=(10, 6))
    ax.plot(monthly['order_month'], monthly['net_revenue'], marker='o', label='Net Revenue', linewidth=2)
    ax.plot(monthly['order_month'], monthly['net_profit'], marker='s', label='Net Profit', linewidth=2)
    ax.set_xlabel('Month')
    ax.set_ylabel('Amount ($)')
    ax.set_title('Monthly Net Revenue vs Net Profit')
    ax.legend()
    ax.grid(True, alpha=0.3)

    if output_path:
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        logger.info(f"Saved revenue vs profit chart to {output_path}")
    plt.close()


def plot_discount_vs_margin(df: pd.DataFrame, output_path: str = None) -> None:
    """Plot discount vs margin scatter with regression line and breakeven marked."""
    fig, ax = plt.subplots(figsize=(10, 6))

    # Scatter plot
    mask = np.isfinite(df['profit_margin']) & np.isfinite(df['discount'])
    ax.scatter(df.loc[mask, 'discount'] * 100, df.loc[mask, 'profit_margin'] * 100,
               alpha=0.3, s=30, label='Orders')

    # Regression line
    discount_clean = df.loc[mask, 'discount'].values
    margin_clean = df.loc[mask, 'profit_margin'].values

    if len(discount_clean) > 1:
        z = np.polyfit(discount_clean, margin_clean, 1)
        p = np.poly1d(z)
        x_line = np.linspace(0, 1, 100)
        ax.plot(x_line * 100, p(x_line) * 100, 'r-', linewidth=2, label='Regression')

        # Mark breakeven
        if abs(z[0]) > 1e-6:
            breakeven = -z[1] / z[0]
            if 0 <= breakeven <= 1:
                ax.axvline(breakeven * 100, color='green', linestyle='--', linewidth=2, label=f'Breakeven: {breakeven*100:.1f}%')

    # Mark zero margin line
    ax.axhline(0, color='black', linestyle='-', linewidth=0.5, alpha=0.5)

    ax.set_xlabel('Discount (%)')
    ax.set_ylabel('Profit Margin (%)')
    ax.set_title('Discount vs Profit Margin')
    ax.legend()
    ax.grid(True, alpha=0.3)

    if output_path:
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        logger.info(f"Saved discount vs margin chart to {output_path}")
    plt.close()


def plot_top_bottom_products(df: pd.DataFrame, top_n: int = 10, output_path: str = None) -> None:
    """Plot top 10 and bottom 10 products by profit."""
    if 'Product Name' not in df.columns:
        logger.warning("Cannot plot top/bottom products: missing Product Name column")
        return

    product_profit = df.groupby('Product Name')['net_profit'].sum().sort_values()

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

    # Bottom products
    bottom = product_profit.head(top_n)
    ax1.barh(range(len(bottom)), bottom.values, color='red', alpha=0.7)
    ax1.set_yticks(range(len(bottom)))
    ax1.set_yticklabels([name[:30] for name in bottom.index], fontsize=9)
    ax1.set_xlabel('Net Profit ($)')
    ax1.set_title(f'Bottom {top_n} Products by Profit')
    ax1.axvline(0, color='black', linestyle='-', linewidth=0.5)

    # Top products
    top = product_profit.tail(top_n)
    ax2.barh(range(len(top)), top.values, color='green', alpha=0.7)
    ax2.set_yticks(range(len(top)))
    ax2.set_yticklabels([name[:30] for name in top.index], fontsize=9)
    ax2.set_xlabel('Net Profit ($)')
    ax2.set_title(f'Top {top_n} Products by Profit')

    plt.tight_layout()

    if output_path:
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        logger.info(f"Saved top/bottom products chart to {output_path}")
    plt.close()


def plot_loss_cause_breakdown(df: pd.DataFrame, output_path: str = None) -> None:
    """Plot breakdown of loss causes."""
    if 'loss_cause' not in df.columns:
        logger.warning("Cannot plot loss cause breakdown: missing loss_cause column")
        return

    loss_causes = df[df['is_loss']]['loss_cause'].value_counts()

    fig, ax = plt.subplots(figsize=(10, 6))
    loss_causes.plot(kind='bar', ax=ax, color=['#d62728', '#ff7f0e', '#2ca02c', '#1f77b4'])
    ax.set_xlabel('Loss Cause')
    ax.set_ylabel('Count')
    ax.set_title('Breakdown of Loss-Making Orders by Cause')
    ax.set_xticklabels(ax.get_xticklabels(), rotation=45, ha='right')

    if output_path:
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        logger.info(f"Saved loss cause breakdown chart to {output_path}")
    plt.close()


def create_dashboard(df: pd.DataFrame, analysis_results: Dict[str, Any],
                     output_path: str = None) -> None:
    """Create 2x3 combined dashboard."""
    setup_plot_style()

    fig = plt.figure(figsize=(16, 12))

    # Margin heatmap
    ax1 = plt.subplot(2, 3, 1)
    if 'Category' in df.columns and 'Region' in df.columns:
        pivot = df.pivot_table(values='profit_margin', index='Category', columns='Region', aggfunc='mean')
        sns.heatmap(pivot, annot=True, fmt='.2%', cmap='RdYlGn', center=0, ax=ax1, cbar_kws={'label': 'Margin'})
        ax1.set_title('Profit Margin by Category & Region')

    # Revenue vs Profit
    ax2 = plt.subplot(2, 3, 2)
    if 'order_month' in df.columns:
        monthly = df.groupby('order_month').agg({'net_revenue': 'sum', 'net_profit': 'sum'}).reset_index()
        ax2.plot(monthly['order_month'], monthly['net_revenue'], marker='o', label='Revenue', linewidth=2)
        ax2.plot(monthly['order_month'], monthly['net_profit'], marker='s', label='Profit', linewidth=2)
        ax2.set_xlabel('Month')
        ax2.set_ylabel('Amount ($)')
        ax2.set_title('Monthly Revenue vs Profit')
        ax2.legend()
        ax2.grid(True, alpha=0.3)

    # Discount vs Margin
    ax3 = plt.subplot(2, 3, 3)
    mask = np.isfinite(df['profit_margin']) & np.isfinite(df['discount'])
    ax3.scatter(df.loc[mask, 'discount'] * 100, df.loc[mask, 'profit_margin'] * 100, alpha=0.3, s=20)
    if mask.sum() > 1:
        z = np.polyfit(df.loc[mask, 'discount'].values, df.loc[mask, 'profit_margin'].values, 1)
        p = np.poly1d(z)
        x_line = np.linspace(0, 1, 100)
        ax3.plot(x_line * 100, p(x_line) * 100, 'r-', linewidth=2)
        ax3.axhline(0, color='black', linestyle='-', linewidth=0.5)
    ax3.set_xlabel('Discount (%)')
    ax3.set_ylabel('Profit Margin (%)')
    ax3.set_title('Discount vs Margin')

    # Top products
    ax4 = plt.subplot(2, 3, 4)
    if 'Product Name' in df.columns:
        top_prod = df.groupby('Product Name')['net_profit'].sum().nlargest(10)
        ax4.barh(range(len(top_prod)), top_prod.values, color='green', alpha=0.7)
        ax4.set_yticks(range(len(top_prod)))
        ax4.set_yticklabels([n[:25] for n in top_prod.index], fontsize=8)
        ax4.set_xlabel('Net Profit ($)')
        ax4.set_title('Top 10 Products by Profit')

    # Bottom products
    ax5 = plt.subplot(2, 3, 5)
    if 'Product Name' in df.columns:
        bot_prod = df.groupby('Product Name')['net_profit'].sum().nsmallest(10)
        ax5.barh(range(len(bot_prod)), bot_prod.values, color='red', alpha=0.7)
        ax5.set_yticks(range(len(bot_prod)))
        ax5.set_yticklabels([n[:25] for n in bot_prod.index], fontsize=8)
        ax5.set_xlabel('Net Profit ($)')
        ax5.set_title('Bottom 10 Products by Profit')

    # Loss cause breakdown
    ax6 = plt.subplot(2, 3, 6)
    if 'loss_cause' in df.columns:
        loss_causes = df[df['is_loss']]['loss_cause'].value_counts()
        colors = {'Discount-driven': '#d62728', 'Shipping-driven': '#ff7f0e', 'Both': '#1f77b4', 'Cost-driven': '#2ca02c'}
        loss_causes.plot(kind='bar', ax=ax6, color=[colors.get(c, '#7f7f7f') for c in loss_causes.index])
        ax6.set_xlabel('Cause')
        ax6.set_ylabel('Count')
        ax6.set_title('Loss-Making Orders by Cause')
        ax6.set_xticklabels(ax6.get_xticklabels(), rotation=45, ha='right')

    plt.tight_layout()

    if output_path:
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        logger.info(f"Saved dashboard to {output_path}")
    plt.close()
