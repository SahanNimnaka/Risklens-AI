"""Orchestration for the read-only anomaly API.

The service builds the feature frame, runs the detector and joins the
deterministic rule result as *context*. Rule points are never passed into the
detector and never change an anomaly score. They are attached after scoring so
the API can show "unusual and also has rule points" without conflating the two
views.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.modules.anomaly_detection.detector import (
    AuditAnomaly,
    detect_anomalies,
)
from app.modules.anomaly_detection.features import build_feature_frame
from app.modules.risk_monitoring import compute_risk


@dataclass(frozen=True)
class AuditAnomalyReport:
    """One anomaly result plus its audit-level rule context."""

    anomaly: AuditAnomaly
    rule_points: int
    rule_ids: tuple[str, ...]


@dataclass(frozen=True)
class AnomalyReport:
    """Anomaly results for one ``as_of`` date, with detector metadata."""

    as_of: date
    audits: tuple[AuditAnomalyReport, ...]
    feature_names: tuple[str, ...]
    contamination: float
    random_state: int
    n_estimators: int
    min_peer_audits: int

    @property
    def flagged(self) -> tuple[AuditAnomalyReport, ...]:
        """Only the audits whose advisory ``is_anomaly`` flag is set."""
        return tuple(item for item in self.audits if item.anomaly.is_anomaly)


def compute_anomalies(session: Session, as_of: date) -> AnomalyReport:
    """Compute anomaly results and join audit-level rule context.

    The function only reads the database. Calling it twice with the same data
    and ``as_of`` returns equal results.
    """
    frame = build_feature_frame(session, as_of)
    detection = detect_anomalies(frame, as_of=as_of)
    risk = compute_risk(session, as_of)

    points_by_audit: dict[str, int] = defaultdict(int)
    rules_by_audit: dict[str, set[str]] = defaultdict(set)
    for hit in risk.hits:
        if hit.audit_ref is None:
            continue
        points_by_audit[hit.audit_ref] += hit.points
        rules_by_audit[hit.audit_ref].add(hit.rule_id)

    audits = tuple(
        AuditAnomalyReport(
            anomaly=anomaly,
            rule_points=points_by_audit[anomaly.audit_ref],
            rule_ids=tuple(sorted(rules_by_audit[anomaly.audit_ref])),
        )
        for anomaly in detection.audits
    )

    return AnomalyReport(
        as_of=as_of,
        audits=audits,
        feature_names=detection.feature_names,
        contamination=detection.contamination,
        random_state=detection.random_state,
        n_estimators=detection.n_estimators,
        min_peer_audits=detection.min_peer_audits,
    )


def get_audit_anomaly(
    session: Session,
    audit_ref: str,
    as_of: date,
) -> AuditAnomalyReport | None:
    """Return one audit's anomaly result, or ``None`` when it is not eligible."""
    report = compute_anomalies(session, as_of)
    for item in report.audits:
        if item.anomaly.audit_ref == audit_ref:
            return item
    return None
