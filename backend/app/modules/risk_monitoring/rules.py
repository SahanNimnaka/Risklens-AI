"""Rule catalog and fixed thresholds for deterministic risk monitoring.

Every number that influences a score lives here. The engine reads these
constants but never changes them at runtime, which is what makes a score
reproducible for a given ``as_of`` date.

The rules are deliberately additive and independent:

* R1 overdue action plan
* R2 unresolved critical finding
* R3 stale non-critical finding
* R4 repeated findings in a lookback window
* R5 blocked action plan
* R6 weak control

Rule 4 and Rule 6 keep the numbering already referenced by the Phase 1 model
and generator docstrings.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Final

from app.models.enums import ControlEffectiveness, FindingSeverity


class AlertSeverity(StrEnum):
    """Presentation severity of a rule hit, independent of finding severity."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass(frozen=True)
class RuleDefinition:
    id: str
    name: str
    description: str
    severity: AlertSeverity
    entity_type: str


RULE_DEFINITIONS: Final[tuple[RuleDefinition, ...]] = (
    RuleDefinition(
        id="R1_overdue_action",
        name="Overdue action plan",
        description=(
            "A corrective action is past its due date and was not completed by "
            "the as-of date. Points scale with the finding severity and how long "
            "the action has been overdue."
        ),
        severity=AlertSeverity.HIGH,
        entity_type="action_plan",
    ),
    RuleDefinition(
        id="R2_unresolved_critical",
        name="Unresolved critical finding",
        description=(
            "A critical finding is still open or in progress. Points increase "
            "once the finding is older than 30 and 90 days."
        ),
        severity=AlertSeverity.CRITICAL,
        entity_type="finding",
    ),
    RuleDefinition(
        id="R3_stale_finding",
        name="Stale non-critical finding",
        description=(
            "A high, medium or low finding has exceeded its remediation SLA. "
            "Critical findings are covered by Rule 2 and are excluded here to "
            "avoid double counting."
        ),
        severity=AlertSeverity.MEDIUM,
        entity_type="finding",
    ),
    RuleDefinition(
        id="R4_repeated_findings",
        name="Repeated findings",
        description=(
            "At least three findings in the same department share a root cause "
            "within the lookback window ending at the as-of date. Points scale "
            "with the number of findings, capped per cluster."
        ),
        severity=AlertSeverity.HIGH,
        entity_type="department",
    ),
    RuleDefinition(
        id="R5_blocked_action",
        name="Blocked action plan",
        description=(
            "A corrective action is blocked. Points equal the severity weight of "
            "the parent finding. A blocked action may also be overdue under Rule 1."
        ),
        severity=AlertSeverity.HIGH,
        entity_type="action_plan",
    ),
    RuleDefinition(
        id="R6_weak_control",
        name="Weak control",
        description=(
            "An active control is ineffective or only partially effective. "
            "Inactive and retired controls are excluded."
        ),
        severity=AlertSeverity.MEDIUM,
        entity_type="control",
    ),
)

RULE_BY_ID: Final[dict[str, RuleDefinition]] = {
    definition.id: definition for definition in RULE_DEFINITIONS
}

# Base weight of a finding, reused by actions so the parent severity drives cost.
SEVERITY_POINTS: Final[dict[FindingSeverity, int]] = {
    FindingSeverity.LOW: 2,
    FindingSeverity.MEDIUM: 5,
    FindingSeverity.HIGH: 10,
    FindingSeverity.CRITICAL: 20,
}

# Rule 1: (upper bound of days overdue, multiplier). The final bucket is open.
OVERDUE_AGING_BUCKETS: Final[tuple[tuple[int, float], ...]] = (
    (30, 1.0),
    (60, 1.5),
    (90, 2.0),
)
OVERDUE_FINAL_MULTIPLIER: Final[float] = 2.5

# Rule 2.
CRITICAL_BASE_POINTS: Final[int] = 20
CRITICAL_AGE_BONUS_DAYS: Final[int] = 30
CRITICAL_AGE_BONUS_POINTS: Final[int] = 10
CRITICAL_AGE_ESCALATION_DAYS: Final[int] = 90
CRITICAL_AGE_ESCALATION_POINTS: Final[int] = 10

# Rule 3. Critical findings are intentionally absent.
STALE_SLA_DAYS: Final[dict[FindingSeverity, int]] = {
    FindingSeverity.HIGH: 60,
    FindingSeverity.MEDIUM: 90,
    FindingSeverity.LOW: 120,
}
STALE_POINTS: Final[dict[FindingSeverity, int]] = {
    FindingSeverity.HIGH: 8,
    FindingSeverity.MEDIUM: 4,
    FindingSeverity.LOW: 2,
}

# Rule 4.
RECURRENCE_WINDOW_DAYS: Final[int] = 180
RECURRENCE_MIN_FINDINGS: Final[int] = 3
RECURRENCE_POINTS_PER_EXTRA: Final[int] = 5
RECURRENCE_MAX_POINTS: Final[int] = 25

# Rule 6.
WEAK_CONTROL_POINTS: Final[dict[ControlEffectiveness, int]] = {
    ControlEffectiveness.INEFFECTIVE: 15,
    ControlEffectiveness.PARTIALLY_EFFECTIVE: 6,
}

# Department bands. Calibrated against the synthetic dataset, not an industry
# standard; changing them is a deliberate, reviewable decision.
LOW_BAND_CEILING: Final[int] = 75
MEDIUM_BAND_CEILING: Final[int] = 150
HIGH_BAND_CEILING: Final[int] = 300


def band_for_score(score: int) -> str:
    """Map a point total to a fixed risk band."""
    if score < LOW_BAND_CEILING:
        return "low"
    if score < MEDIUM_BAND_CEILING:
        return "medium"
    if score < HIGH_BAND_CEILING:
        return "high"
    return "critical"


def overdue_multiplier(days_overdue: int) -> float:
    """Aging multiplier for Rule 1; ``days_overdue`` is always positive."""
    for upper_bound, multiplier in OVERDUE_AGING_BUCKETS:
        if days_overdue <= upper_bound:
            return multiplier
    return OVERDUE_FINAL_MULTIPLIER


def round_half_up(value: float) -> int:
    """Deterministic rounding that avoids Python's banker's rounding."""
    return int(value + 0.5)
