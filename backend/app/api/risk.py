"""Read-only HTTP API for deterministic risk monitoring.

The endpoints never write. They call ``compute_risk`` for an explicit ``as_of``
date and serialize the resulting hits, so the explanation returned over HTTP is
the same object the engine tests assert on.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models import Audit, Finding
from app.models.enums import Department
from app.modules.risk_monitoring import (
    DepartmentRisk,
    PortfolioRisk,
    compute_risk,
)
from app.modules.risk_monitoring.rules import (
    CRITICAL_AGE_BONUS_DAYS,
    CRITICAL_AGE_BONUS_POINTS,
    CRITICAL_AGE_ESCALATION_DAYS,
    CRITICAL_AGE_ESCALATION_POINTS,
    CRITICAL_BASE_POINTS,
    HIGH_BAND_CEILING,
    LOW_BAND_CEILING,
    MEDIUM_BAND_CEILING,
    OVERDUE_AGING_BUCKETS,
    OVERDUE_FINAL_MULTIPLIER,
    RECURRENCE_MAX_POINTS,
    RECURRENCE_MIN_FINDINGS,
    RECURRENCE_POINTS_PER_EXTRA,
    RECURRENCE_WINDOW_DAYS,
    RULE_DEFINITIONS,
    SEVERITY_POINTS,
    STALE_POINTS,
    STALE_SLA_DAYS,
    WEAK_CONTROL_POINTS,
    band_for_score,
)
from app.schemas.risk import (
    DepartmentDetailResponse,
    DepartmentSummaryResponse,
    FindingRiskResponse,
    OpenFindingCountsResponse,
    PortfolioSummaryResponse,
    RiskBandResponse,
    RuleBreakdownResponse,
    RuleCatalogResponse,
    RuleDefinitionResponse,
    RuleHitResponse,
)

router = APIRouter(prefix="/risk", tags=["risk"])

AS_OF_DESCRIPTION = (
    "Evaluation date in ISO format. Defaults to the fixed synthetic reference "
    "date (2026-10-31) so demos are reproducible."
)


def _enum_points(points: dict[Any, int]) -> dict[str, int]:
    return {member.value: value for member, value in points.items()}


def _rule_scoring(rule_id: str) -> dict[str, Any]:
    """Return the exact constants that drive one rule's points."""
    if rule_id == "R1_overdue_action":
        return {
            "severity_points": _enum_points(SEVERITY_POINTS),
            "aging_buckets": [
                {"max_days_overdue": upper, "multiplier": multiplier}
                for upper, multiplier in OVERDUE_AGING_BUCKETS
            ]
            + [{"max_days_overdue": None, "multiplier": OVERDUE_FINAL_MULTIPLIER}],
            "rounding": "half_up",
        }
    if rule_id == "R2_unresolved_critical":
        return {
            "base_points": CRITICAL_BASE_POINTS,
            "age_bonus": {
                "after_days": CRITICAL_AGE_BONUS_DAYS,
                "points": CRITICAL_AGE_BONUS_POINTS,
            },
            "age_escalation": {
                "after_days": CRITICAL_AGE_ESCALATION_DAYS,
                "points": CRITICAL_AGE_ESCALATION_POINTS,
            },
        }
    if rule_id == "R3_stale_finding":
        return {
            "sla_days": _enum_points(STALE_SLA_DAYS),
            "points": _enum_points(STALE_POINTS),
        }
    if rule_id == "R4_repeated_findings":
        return {
            "window_days": RECURRENCE_WINDOW_DAYS,
            "min_findings": RECURRENCE_MIN_FINDINGS,
            "points_per_extra_finding": RECURRENCE_POINTS_PER_EXTRA,
            "max_points": RECURRENCE_MAX_POINTS,
        }
    if rule_id == "R5_blocked_action":
        return {
            "points_source": "parent_finding_severity",
            "severity_points": _enum_points(SEVERITY_POINTS),
        }
    if rule_id == "R6_weak_control":
        return {"points": _enum_points(WEAK_CONTROL_POINTS)}
    raise ValueError(f"Unknown rule id: {rule_id}")  # pragma: no cover


def _rule_catalog() -> RuleCatalogResponse:
    return RuleCatalogResponse(
        bands=[
            RiskBandResponse(
                name="low",
                min_score=0,
                max_score=LOW_BAND_CEILING - 1,
            ),
            RiskBandResponse(
                name="medium",
                min_score=LOW_BAND_CEILING,
                max_score=MEDIUM_BAND_CEILING - 1,
            ),
            RiskBandResponse(
                name="high",
                min_score=MEDIUM_BAND_CEILING,
                max_score=HIGH_BAND_CEILING - 1,
            ),
            RiskBandResponse(
                name="critical",
                min_score=HIGH_BAND_CEILING,
                max_score=None,
            ),
        ],
        severity_points=_enum_points(SEVERITY_POINTS),
        rules=[
            RuleDefinitionResponse(
                id=definition.id,
                name=definition.name,
                description=definition.description,
                severity=definition.severity,
                entity_type=definition.entity_type,
                scoring=_rule_scoring(definition.id),
            )
            for definition in RULE_DEFINITIONS
        ],
    )


def _hit_response(hit) -> RuleHitResponse:
    return RuleHitResponse.model_validate(hit)


def _breakdown_response(breakdown) -> list[RuleBreakdownResponse]:
    return [
        RuleBreakdownResponse.model_validate(item) for item in breakdown
    ]


def _open_findings(counts) -> OpenFindingCountsResponse:
    return OpenFindingCountsResponse.model_validate(counts)


def _department_summary(item: DepartmentRisk) -> DepartmentSummaryResponse:
    return DepartmentSummaryResponse(
        department=item.department,
        score=item.score,
        band=item.band,
        hit_count=len(item.hits),
        breakdown=_breakdown_response(item.breakdown),
        open_findings=_open_findings(item.open_findings),
    )


def _department_detail(item: DepartmentRisk) -> DepartmentDetailResponse:
    summary = _department_summary(item)
    return DepartmentDetailResponse(
        **summary.model_dump(),
        hits=[_hit_response(hit) for hit in item.hits],
    )


def _portfolio_summary(risk: PortfolioRisk) -> PortfolioSummaryResponse:
    totals = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    for item in risk.departments:
        for severity in totals:
            totals[severity] += getattr(item.open_findings, severity)

    return PortfolioSummaryResponse(
        as_of=risk.as_of,
        score=risk.score,
        band=risk.band,
        total_hits=len(risk.hits),
        breakdown=_breakdown_response(risk.breakdown),
        open_findings=OpenFindingCountsResponse(
            **totals,
            total=sum(totals.values()),
        ),
        departments=[
            _department_summary(item) for item in risk.departments
        ],
    )


def _finding_risk(
    session: Session,
    finding_ref: str,
    as_of: date,
) -> FindingRiskResponse:
    finding = session.scalar(
        select(Finding).where(Finding.finding_ref == finding_ref)
    )
    if finding is None:
        raise HTTPException(
            status_code=404,
            detail=f"Finding {finding_ref!r} was not found.",
        )

    audit = session.get(Audit, finding.audit_id)
    if audit is None:  # pragma: no cover - guarded by the foreign key
        raise HTTPException(
            status_code=500,
            detail=f"Finding {finding_ref!r} has no audit.",
        )

    risk = compute_risk(session, as_of)
    direct = [hit for hit in risk.hits if hit.finding_ref == finding_ref]
    related = [
        hit
        for hit in risk.hits
        if hit.rule_id == "R4_repeated_findings"
        and finding_ref in hit.evidence.get("finding_refs", ())
    ]
    score = sum(hit.points for hit in direct)

    return FindingRiskResponse(
        as_of=as_of,
        finding_ref=finding.finding_ref,
        audit_ref=audit.audit_ref,
        department=audit.department,
        severity=finding.severity,
        status=finding.status,
        identified_date=finding.identified_date,
        included_in_scoring=finding.identified_date <= as_of,
        score=score,
        band=band_for_score(score),
        hits=[_hit_response(hit) for hit in direct],
        related_department_hits=[_hit_response(hit) for hit in related],
    )


@router.get(
    "/rules",
    response_model=RuleCatalogResponse,
    summary="Explain the rule catalog and score bands",
)
def get_risk_rules() -> RuleCatalogResponse:
    """Return every rule, its thresholds, the severity weights and the bands."""
    return _rule_catalog()


@router.get(
    "/summary",
    response_model=PortfolioSummaryResponse,
    summary="Portfolio risk score and department ranking",
)
def get_risk_summary(
    as_of: date = Query(default=settings.synthetic_data_reference_date, description=AS_OF_DESCRIPTION),
    session: Session = Depends(get_db),
) -> PortfolioSummaryResponse:
    """Compute the whole portfolio at ``as_of`` and rank its departments."""
    return _portfolio_summary(compute_risk(session, as_of))


@router.get(
    "/departments",
    response_model=list[DepartmentSummaryResponse],
    summary="Department risk scores and rule breakdowns",
)
def get_risk_departments(
    as_of: date = Query(default=settings.synthetic_data_reference_date, description=AS_OF_DESCRIPTION),
    session: Session = Depends(get_db),
) -> list[DepartmentSummaryResponse]:
    """Return every department, highest score first."""
    risk = compute_risk(session, as_of)
    return [_department_summary(item) for item in risk.departments]


@router.get(
    "/departments/{department}",
    response_model=DepartmentDetailResponse,
    summary="One department's score and every attributed hit",
)
def get_risk_department(
    department: Department,
    as_of: date = Query(default=settings.synthetic_data_reference_date, description=AS_OF_DESCRIPTION),
    session: Session = Depends(get_db),
) -> DepartmentDetailResponse:
    """Return one department's summary plus its individual hits."""
    risk = compute_risk(session, as_of)
    for item in risk.departments:
        if item.department is department:
            return _department_detail(item)
    raise HTTPException(
        status_code=404,
        detail=f"Department {department.value!r} has no risk result.",
    )


@router.get(
    "/findings/{finding_ref}",
    response_model=FindingRiskResponse,
    summary="One finding's direct hits and recurrence context",
)
def get_risk_finding(
    finding_ref: str,
    as_of: date = Query(default=settings.synthetic_data_reference_date, description=AS_OF_DESCRIPTION),
    session: Session = Depends(get_db),
) -> FindingRiskResponse:
    """Return a finding's metadata, direct hits and related R4 clusters.

    ``score`` counts only hits attributed directly to the finding. Rule 4
    cluster points belong to the department and appear under
    ``related_department_hits`` without being added.
    """
    return _finding_risk(session, finding_ref, as_of)
