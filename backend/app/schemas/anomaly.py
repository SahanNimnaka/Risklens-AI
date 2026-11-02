"""Pydantic response models for the read-only anomaly API.

The models expose anomaly results as advisory information. Rule points and rule
ids are included for context only; they are not model inputs and do not change
the anomaly score.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models.enums import Department

DeviationDirection = Literal["above_peer", "below_peer", "at_peer"]


class FeatureDeviationResponse(BaseModel):
    """One feature's peer-relative deviation for one audit."""

    model_config = ConfigDict(from_attributes=True)

    feature: str
    value: float
    peer_median: float
    robust_z: float
    direction: DeviationDirection


class AuditAnomalyResponse(BaseModel):
    """One audit's anomaly result in the ranked list."""

    audit_ref: str
    audit_title: str
    department: Department
    anomaly_score: float
    score_percentile: float
    is_anomaly: bool
    rule_points: int
    rule_ids: list[str]
    features: dict[str, float]
    deviations: list[FeatureDeviationResponse]


class AuditAnomalyDetailResponse(AuditAnomalyResponse):
    """One audit with every feature deviation, for the detail endpoint."""

    as_of: date
    disclaimer: str
    all_deviations: list[FeatureDeviationResponse]


class AnomalyDetectorResponse(BaseModel):
    """The fixed detector configuration, exposed for transparency."""

    method: str
    n_estimators: int
    contamination: float
    random_state: int
    min_peer_audits: int
    feature_names: list[str]


class AnomalyListResponse(BaseModel):
    """Ranked anomaly results plus detector metadata and a caveat."""

    as_of: date
    detector: AnomalyDetectorResponse
    disclaimer: str
    total: int
    flagged: int
    audits: list[AuditAnomalyResponse]
