"""Pydantic response models for the read-only risk API.

The models are intentionally explicit rather than exposing engine dataclasses
directly, so that the HTTP contract can stay stable while the engine internals
change. Enum fields keep their lowercase machine values in JSON.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.models.enums import Department, FindingSeverity, FindingStatus
from app.modules.risk_monitoring.rules import AlertSeverity


class RuleHitResponse(BaseModel):
    """One rule application, including its deterministic explanation."""

    model_config = ConfigDict(from_attributes=True)

    rule_id: str
    rule_name: str
    severity: AlertSeverity
    points: int
    entity_type: str
    entity_ref: str
    department: Department
    finding_ref: str | None
    control_ref: str | None
    audit_ref: str | None
    reason: str
    evidence: dict[str, Any]


class RuleBreakdownResponse(BaseModel):
    """Aggregate count and points for one rule."""

    model_config = ConfigDict(from_attributes=True)

    rule_id: str
    rule_name: str
    severity: AlertSeverity
    entity_type: str
    hits: int
    points: int


class OpenFindingCountsResponse(BaseModel):
    """Unresolved findings by severity, reported as context only."""

    model_config = ConfigDict(from_attributes=True)

    low: int
    medium: int
    high: int
    critical: int
    total: int


class DepartmentSummaryResponse(BaseModel):
    """Department score and rule breakdown without the individual hits."""

    department: Department
    score: int
    band: str
    hit_count: int
    breakdown: list[RuleBreakdownResponse]
    open_findings: OpenFindingCountsResponse


class DepartmentDetailResponse(DepartmentSummaryResponse):
    """Department summary plus every rule hit attributed to it."""

    hits: list[RuleHitResponse]


class PortfolioSummaryResponse(BaseModel):
    """Portfolio score, rule breakdown and ranked departments."""

    as_of: date
    score: int
    band: str
    total_hits: int
    breakdown: list[RuleBreakdownResponse]
    open_findings: OpenFindingCountsResponse
    departments: list[DepartmentSummaryResponse]


class FindingRiskResponse(BaseModel):
    """One finding with its direct hits and related recurrence clusters.

    ``score`` sums only the hits attributed directly to the finding. The hits
    in ``related_department_hits`` are Rule 4 clusters whose points belong to
    the department, so they are shown for context and not added to ``score``.
    """

    as_of: date
    finding_ref: str
    audit_ref: str
    department: Department
    severity: FindingSeverity
    status: FindingStatus
    identified_date: date
    included_in_scoring: bool
    score: int
    band: str
    hits: list[RuleHitResponse]
    related_department_hits: list[RuleHitResponse]


class RiskBandResponse(BaseModel):
    """One score band, with an open-ended upper bound for the top band."""

    name: str
    min_score: int
    max_score: int | None


class RuleDefinitionResponse(BaseModel):
    """A rule's identity plus the exact constants used to score it."""

    id: str
    name: str
    description: str
    severity: AlertSeverity
    entity_type: str
    scoring: dict[str, Any]


class RuleCatalogResponse(BaseModel):
    """Everything needed to explain how a score is produced."""

    bands: list[RiskBandResponse]
    severity_points: dict[str, int]
    rules: list[RuleDefinitionResponse]
