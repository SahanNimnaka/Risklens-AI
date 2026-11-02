"""Supplementary anomaly detection for audits.

Public surface for Phase 3: audit feature construction, peer-relative
normalization and IsolationForest scoring. These results are advisory only and
never change the deterministic risk score.
"""

from app.modules.anomaly_detection.detector import (
    AuditAnomaly,
    AnomalyDetection,
    FeatureDeviation,
    PeerNormalization,
    detect_anomalies,
    normalize_features,
)
from app.modules.anomaly_detection.features import (
    FEATURE_NAMES,
    build_feature_frame,
)
from app.modules.anomaly_detection.service import (
    AnomalyReport,
    AuditAnomalyReport,
    compute_anomalies,
    get_audit_anomaly,
)

__all__ = [
    "FEATURE_NAMES",
    "AnomalyDetection",
    "AnomalyReport",
    "AuditAnomaly",
    "AuditAnomalyReport",
    "FeatureDeviation",
    "PeerNormalization",
    "build_feature_frame",
    "compute_anomalies",
    "detect_anomalies",
    "get_audit_anomaly",
    "normalize_features",
]
