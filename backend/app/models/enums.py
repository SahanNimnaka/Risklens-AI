"""Controlled vocabularies for the audit domain.

Values are the exact strings persisted in PostgreSQL (lowercase snake_case).
They are stable machine identifiers; human-readable labels belong to the API
and UI layers so that renaming a label never requires a migration.
"""

from enum import StrEnum


class Department(StrEnum):
    FINANCE = "finance"
    PROCUREMENT = "procurement"
    HUMAN_RESOURCES = "human_resources"
    IT = "it"
    OPERATIONS = "operations"
    COMPLIANCE = "compliance"


class AuditType(StrEnum):
    FINANCIAL = "financial"
    OPERATIONAL = "operational"
    COMPLIANCE = "compliance"
    IT = "it"
    SPECIAL_REVIEW = "special_review"
    FOLLOW_UP = "follow_up"


class AuditStatus(StrEnum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ControlCategory(StrEnum):
    ACCESS_MANAGEMENT = "access_management"
    SEGREGATION_OF_DUTIES = "segregation_of_duties"
    RECONCILIATION = "reconciliation"
    APPROVAL_WORKFLOW = "approval_workflow"
    CHANGE_MANAGEMENT = "change_management"
    VENDOR_MANAGEMENT = "vendor_management"
    DATA_PROTECTION = "data_protection"
    PHYSICAL_SECURITY = "physical_security"
    TRAINING_AWARENESS = "training_awareness"


class ControlFrequency(StrEnum):
    CONTINUOUS = "continuous"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUAL = "annual"
    AD_HOC = "ad_hoc"


class ControlStatus(StrEnum):
    """Lifecycle state of a control, independent of how well it works."""

    ACTIVE = "active"
    INACTIVE = "inactive"
    RETIRED = "retired"


class ControlEffectiveness(StrEnum):
    EFFECTIVE = "effective"
    PARTIALLY_EFFECTIVE = "partially_effective"
    INEFFECTIVE = "ineffective"
    NOT_TESTED = "not_tested"


class FindingSeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class FindingStatus(StrEnum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    ACCEPTED = "accepted"


class ActionStatus(StrEnum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    BLOCKED = "blocked"


class RootCauseCategory(StrEnum):
    PROCESS_GAP = "process_gap"
    HUMAN_ERROR = "human_error"
    SYSTEM_LIMITATION = "system_limitation"
    POLICY_NON_COMPLIANCE = "policy_non_compliance"
    SEGREGATION_OF_DUTIES = "segregation_of_duties"
    DATA_QUALITY = "data_quality"
    EXTERNAL_FACTOR = "external_factor"
