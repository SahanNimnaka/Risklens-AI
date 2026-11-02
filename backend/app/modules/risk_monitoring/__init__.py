"""Deterministic risk monitoring.

Public surface for Phase 2: the rule catalog and the scoring engine. The API
layer imports ``compute_risk`` and the result dataclasses from here.
"""

from app.modules.risk_monitoring.engine import (
    DepartmentRisk,
    OpenFindingCounts,
    PortfolioRisk,
    RuleBreakdown,
    RuleHit,
    compute_risk,
)
from app.modules.risk_monitoring.rules import (
    RULE_DEFINITIONS,
    RULE_BY_ID,
    AlertSeverity,
    RuleDefinition,
    band_for_score,
)

__all__ = [
    "AlertSeverity",
    "DepartmentRisk",
    "OpenFindingCounts",
    "PortfolioRisk",
    "RULE_BY_ID",
    "RULE_DEFINITIONS",
    "RuleBreakdown",
    "RuleDefinition",
    "RuleHit",
    "band_for_score",
    "compute_risk",
]
