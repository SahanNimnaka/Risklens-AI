"""Read-only HTTP API for supplementary anomaly detection.

The endpoints never write. They build audit features, run the deterministic
IsolationForest detector and join the rule result as context. Neither endpoint
changes ``/risk/*`` or the deterministic portfolio score.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.modules.anomaly_detection import (
    AnomalyReport,
    AuditAnomalyReport,
    compute_anomalies,
    get_audit_anomaly,
)
from app.schemas.anomaly import (
    AnomalyDetectorResponse,
    AnomalyListResponse,
    AuditAnomalyDetailResponse,
    AuditAnomalyResponse,
    FeatureDeviationResponse,
)

router = APIRouter(prefix="/anomalies", tags=["anomalies"])

AS_OF_DESCRIPTION = (
    "Evaluation date in ISO format. Defaults to the fixed synthetic reference "
    "date (2026-10-31) so demos are reproducible."
)

DISCLAIMER = (
    "Anomaly scores describe how unusual an audit is relative to its department "
    "peers. They are advisory, do not change the deterministic risk score, and "
    "are not a measure of accuracy."
)


def _deviation_response(deviation) -> FeatureDeviationResponse:
    return FeatureDeviationResponse.model_validate(deviation)


def _audit_response(item: AuditAnomalyReport) -> AuditAnomalyResponse:
    anomaly = item.anomaly
    return AuditAnomalyResponse(
        audit_ref=anomaly.audit_ref,
        audit_title=anomaly.audit_title,
        department=anomaly.department,
        anomaly_score=anomaly.anomaly_score,
        score_percentile=anomaly.score_percentile,
        is_anomaly=anomaly.is_anomaly,
        rule_points=item.rule_points,
        rule_ids=list(item.rule_ids),
        features=dict(anomaly.features),
        deviations=[
            _deviation_response(deviation) for deviation in anomaly.deviations
        ],
    )


def _detector_response(report: AnomalyReport) -> AnomalyDetectorResponse:
    return AnomalyDetectorResponse(
        method="IsolationForest",
        n_estimators=report.n_estimators,
        contamination=report.contamination,
        random_state=report.random_state,
        min_peer_audits=report.min_peer_audits,
        feature_names=list(report.feature_names),
    )


@router.get(
    "/audits",
    response_model=AnomalyListResponse,
    summary="Ranked audit anomalies with rule context",
)
def list_anomalies(
    as_of: date = Query(
        default=settings.synthetic_data_reference_date,
        description=AS_OF_DESCRIPTION,
    ),
    session: Session = Depends(get_db),
) -> AnomalyListResponse:
    """Return every eligible audit, most unusual first.

    ``is_anomaly`` is an advisory cut at the fixed contamination. The continuous
    score and percentile are the primary output. Rule points and ids are joined
    for context only.
    """
    report = compute_anomalies(session, as_of)
    return AnomalyListResponse(
        as_of=report.as_of,
        detector=_detector_response(report),
        disclaimer=DISCLAIMER,
        total=len(report.audits),
        flagged=len(report.flagged),
        audits=[_audit_response(item) for item in report.audits],
    )


@router.get(
    "/audits/{audit_ref}",
    response_model=AuditAnomalyDetailResponse,
    summary="One audit with every feature deviation",
)
def get_anomaly(
    audit_ref: str,
    as_of: date = Query(
        default=settings.synthetic_data_reference_date,
        description=AS_OF_DESCRIPTION,
    ),
    session: Session = Depends(get_db),
) -> AuditAnomalyDetailResponse:
    """Return one audit's anomaly result with all feature deviations."""
    item = get_audit_anomaly(session, audit_ref, as_of)
    if item is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Audit {audit_ref!r} has no anomaly result at "
                f"{as_of.isoformat()}; it may not exist or may have no findings "
                "identified by that date."
            ),
        )

    base = _audit_response(item)
    return AuditAnomalyDetailResponse(
        **base.model_dump(),
        as_of=as_of,
        disclaimer=DISCLAIMER,
        all_deviations=[
            _deviation_response(deviation)
            for deviation in item.anomaly.all_deviations
        ],
    )
