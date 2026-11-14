"""
Setup configuration for ProfitLeak package.
"""

from setuptools import setup, find_packages

setup(
    name="profitleak",
    version="0.1.0",
    description="Automated Python analytics pipeline for true net profitability",
    author="ProfitLeak Contributors",
    package_dir={"": "src"},
    packages=find_packages("src"),
    python_requires=">=3.10",
    install_requires=[
        "pandas>=2.2.0",
        "numpy>=1.26.0",
        "matplotlib>=3.8.0",
        "seaborn>=0.13.0",
        "pyyaml>=6.0",
        "openpyxl>=3.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pandera>=0.18.0",
        ],
    },
)
