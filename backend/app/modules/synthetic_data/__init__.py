"""Synthetic audit data generator and loader for RiskLens AI.

Everything in this package is fictional and generated from a fixed seed.
No real company, employee, vendor, or audit record is represented.
"""

from app.modules.synthetic_data.catalog import DATASET_REFERENCE_DATE
from app.modules.synthetic_data.generator import DatasetBundle, SyntheticDatasetGenerator
from app.modules.synthetic_data.loader import (
    LoaderReport,
    TableStats,
    load_dataset,
    reset_synthetic_data,
)
from app.modules.synthetic_data.validation import (
    DatasetReport,
    DatasetValidationError,
    validate_dataset,
)

__all__ = [
    "DATASET_REFERENCE_DATE",
    "DatasetBundle",
    "DatasetReport",
    "DatasetValidationError",
    "LoaderReport",
    "SyntheticDatasetGenerator",
    "TableStats",
    "load_dataset",
    "reset_synthetic_data",
    "validate_dataset",
]
