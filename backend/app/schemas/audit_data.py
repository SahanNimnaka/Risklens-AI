"""Pydantic response models for the read-only audit data API.

These models expose the operational records the frontend needs for the audit,
finding and action-plan pages. Risk values are computed by the existing engine
and included here for display; they are not recalculated by clients.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.models.enums import (
    ActionStatus,
    AuditStatus,
    AuditType,
    Department,
    FindingSeverity,
    FindingStatus,
    RootCauseCategory,
)
from app.schemas.risk import RuleHitResponse


class AuditListItem(BaseModel):
    """One audit engagement with counts at the requested as-of date."""

    audit_ref: str
    title: str
    department: Department
    audit_type: AuditType
    lead_auditor: str
    start_date: date
    end_date: date | None
    status: AuditStatus
    finding_count: int
    open_finding_count: int
    action_count: int
    overdue_action_count: int


class AuditListResponse(BaseModel):
    """Complete audit directory for one as-of date."""

    as_of: date
    total: int
    items: list[AuditListItem]


class FindingListItem(BaseModel):
    """One finding with its audit context and direct rule attribution."""

    finding_ref: str
    title: str
    severity: FindingSeverity
    status: FindingStatus
    root_cause_category: RootCauseCategory
    identified_date: date
    audit_ref: str
    audit_title: str
    department: Department
    control_ref: str | None
    action_count: int
    risk_score: int
    risk_band: str
    rule_ids: list[str]


class FindingListResponse(BaseModel):
    """Findings identified by the requested as-of date."""

    as_of: date
    total: int
    items: list[FindingListItem]


class ActionPlanListItem(BaseModel):
    """One action plan with its finding context and action-level rule hits."""

    action_id: int
    action_description: str
    assigned_owner: str
    due_date: date
    status: ActionStatus
    completion_date: date | None
    is_overdue: bool
    days_overdue: int
    finding_ref: str
    finding_title: str
    finding_severity: FindingSeverity
    finding_status: FindingStatus
    audit_ref: str
    audit_title: str
    department: Department
    rule_points: int
    rule_hits: list[RuleHitResponse]


class ActionPlanListResponse(BaseModel):
    """Action plans visible at the requested as-of date."""

    as_of: date
    total: int
    items: list[ActionPlanListItem]
