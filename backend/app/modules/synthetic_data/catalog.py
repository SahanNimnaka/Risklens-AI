"""Static reference data for the synthetic audit dataset.

These are business templates, not random values: departments have distinct
risk profiles, controls belong to plausible categories, and finding text is
chosen to match the root cause. The generator combines them with a seeded
random number generator, so the same seed always yields the same dataset.

The reference date is fixed rather than "today" so the dataset is
reproducible. Overdue calculations in Phase 2 always take an explicit
``as_of`` date.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.models.enums import (
    AuditType,
    ControlCategory,
    ControlFrequency,
    Department,
    FindingSeverity,
    RootCauseCategory,
)

DATASET_REFERENCE_DATE = date(2026, 10, 31)
HISTORY_DAYS = 720

DEPARTMENT_CODES: dict[Department, str] = {
    Department.FINANCE: "FIN",
    Department.PROCUREMENT: "PRC",
    Department.HUMAN_RESOURCES: "HRS",
    Department.IT: "ITS",
    Department.OPERATIONS: "OPS",
    Department.COMPLIANCE: "CMP",
}

DEPARTMENT_LABELS: dict[Department, str] = {
    Department.FINANCE: "Finance",
    Department.PROCUREMENT: "Procurement",
    Department.HUMAN_RESOURCES: "Human Resources",
    Department.IT: "IT",
    Department.OPERATIONS: "Operations",
    Department.COMPLIANCE: "Compliance",
}


@dataclass(frozen=True)
class DepartmentProfile:
    """Business behaviour that drives the generated records.

    audit_weight controls relative audit volume; the severity weights and
    effectiveness rate make some departments structurally riskier than
    others; remediation_speed stretches (or shortens) action-plan due dates;
    repeated_root_cause gives each department one recurring theme so that
    Rule 4 (repeated findings) has something realistic to detect.
    """

    department: Department
    audit_weight: float
    avg_findings_per_audit: float
    severity_weights: dict[FindingSeverity, float]
    effective_rate: float
    remediation_speed: float
    overdue_rate: float
    blocked_bonus: float
    repeated_root_cause: RootCauseCategory


DEPARTMENT_PROFILES: dict[Department, DepartmentProfile] = {
    Department.FINANCE: DepartmentProfile(
        department=Department.FINANCE,
        audit_weight=1.0,
        avg_findings_per_audit=3.2,
        severity_weights={
            FindingSeverity.LOW: 0.30,
            FindingSeverity.MEDIUM: 0.40,
            FindingSeverity.HIGH: 0.24,
            FindingSeverity.CRITICAL: 0.06,
        },
        effective_rate=0.65,
        remediation_speed=1.0,
        overdue_rate=0.22,
        blocked_bonus=0.0,
        repeated_root_cause=RootCauseCategory.DATA_QUALITY,
    ),
    Department.PROCUREMENT: DepartmentProfile(
        department=Department.PROCUREMENT,
        audit_weight=1.15,
        avg_findings_per_audit=4.0,
        severity_weights={
            FindingSeverity.LOW: 0.20,
            FindingSeverity.MEDIUM: 0.37,
            FindingSeverity.HIGH: 0.32,
            FindingSeverity.CRITICAL: 0.11,
        },
        effective_rate=0.42,
        remediation_speed=1.25,
        overdue_rate=0.42,
        blocked_bonus=0.05,
        repeated_root_cause=RootCauseCategory.PROCESS_GAP,
    ),
    Department.HUMAN_RESOURCES: DepartmentProfile(
        department=Department.HUMAN_RESOURCES,
        audit_weight=0.80,
        avg_findings_per_audit=2.6,
        severity_weights={
            FindingSeverity.LOW: 0.38,
            FindingSeverity.MEDIUM: 0.38,
            FindingSeverity.HIGH: 0.20,
            FindingSeverity.CRITICAL: 0.04,
        },
        effective_rate=0.62,
        remediation_speed=0.95,
        overdue_rate=0.25,
        blocked_bonus=0.0,
        repeated_root_cause=RootCauseCategory.HUMAN_ERROR,
    ),
    Department.IT: DepartmentProfile(
        department=Department.IT,
        audit_weight=1.0,
        avg_findings_per_audit=3.6,
        severity_weights={
            FindingSeverity.LOW: 0.18,
            FindingSeverity.MEDIUM: 0.34,
            FindingSeverity.HIGH: 0.32,
            FindingSeverity.CRITICAL: 0.16,
        },
        effective_rate=0.40,
        remediation_speed=1.35,
        overdue_rate=0.35,
        blocked_bonus=0.08,
        repeated_root_cause=RootCauseCategory.SEGREGATION_OF_DUTIES,
    ),
    Department.OPERATIONS: DepartmentProfile(
        department=Department.OPERATIONS,
        audit_weight=1.10,
        avg_findings_per_audit=3.4,
        severity_weights={
            FindingSeverity.LOW: 0.25,
            FindingSeverity.MEDIUM: 0.40,
            FindingSeverity.HIGH: 0.27,
            FindingSeverity.CRITICAL: 0.08,
        },
        effective_rate=0.50,
        remediation_speed=1.15,
        overdue_rate=0.30,
        blocked_bonus=0.15,
        repeated_root_cause=RootCauseCategory.PROCESS_GAP,
    ),
    Department.COMPLIANCE: DepartmentProfile(
        department=Department.COMPLIANCE,
        audit_weight=0.75,
        avg_findings_per_audit=2.4,
        severity_weights={
            FindingSeverity.LOW: 0.40,
            FindingSeverity.MEDIUM: 0.38,
            FindingSeverity.HIGH: 0.18,
            FindingSeverity.CRITICAL: 0.04,
        },
        effective_rate=0.75,
        remediation_speed=0.90,
        overdue_rate=0.15,
        blocked_bonus=0.0,
        repeated_root_cause=RootCauseCategory.POLICY_NON_COMPLIANCE,
    ),
}

DEPARTMENT_AUDIT_TYPES: dict[Department, dict[AuditType, float]] = {
    Department.FINANCE: {
        AuditType.FINANCIAL: 0.50,
        AuditType.OPERATIONAL: 0.20,
        AuditType.COMPLIANCE: 0.15,
        AuditType.SPECIAL_REVIEW: 0.15,
    },
    Department.PROCUREMENT: {
        AuditType.OPERATIONAL: 0.40,
        AuditType.COMPLIANCE: 0.30,
        AuditType.FINANCIAL: 0.20,
        AuditType.SPECIAL_REVIEW: 0.10,
    },
    Department.HUMAN_RESOURCES: {
        AuditType.OPERATIONAL: 0.50,
        AuditType.COMPLIANCE: 0.35,
        AuditType.SPECIAL_REVIEW: 0.15,
    },
    Department.IT: {
        AuditType.IT: 0.55,
        AuditType.OPERATIONAL: 0.20,
        AuditType.COMPLIANCE: 0.15,
        AuditType.SPECIAL_REVIEW: 0.10,
    },
    Department.OPERATIONS: {
        AuditType.OPERATIONAL: 0.55,
        AuditType.COMPLIANCE: 0.20,
        AuditType.IT: 0.15,
        AuditType.SPECIAL_REVIEW: 0.10,
    },
    Department.COMPLIANCE: {
        AuditType.COMPLIANCE: 0.55,
        AuditType.OPERATIONAL: 0.25,
        AuditType.SPECIAL_REVIEW: 0.20,
    },
}

LEAD_AUDITORS: tuple[str, ...] = (
    "A. Mbeki",
    "S. Chen",
    "R. Patel",
    "L. Novak",
    "T. Okafor",
    "M. Haddad",
    "J. Lindqvist",
    "D. Ferreira",
)

DEPARTMENT_OWNERS: dict[Department, tuple[str, ...]] = {
    Department.FINANCE: ("E. Moreau", "K. Singh", "P. Alvarez", "N. Brooks"),
    Department.PROCUREMENT: ("V. Rossi", "B. Kowalski", "F. Adeyemi", "C. Duarte"),
    Department.HUMAN_RESOURCES: ("I. Larsson", "M. Tanaka", "O. Haddad", "S. Moyo"),
    Department.IT: ("R. Kumar", "J. Silva", "A. Novak", "T. Nguyen"),
    Department.OPERATIONS: ("D. Osei", "L. Bianchi", "P. Kovac", "Y. Kim"),
    Department.COMPLIANCE: ("C. Mensah", "H. Ali", "S. Dubois", "F. Weber"),
}


@dataclass(frozen=True)
class ControlTemplate:
    name: str
    description: str
    category: ControlCategory
    frequency: ControlFrequency


CONTROL_TEMPLATES: dict[Department, tuple[ControlTemplate, ...]] = {
    Department.FINANCE: (
        ControlTemplate(
            "Month-end balance sheet reconciliation",
            "All balance sheet accounts are reconciled and reviewed before close.",
            ControlCategory.RECONCILIATION,
            ControlFrequency.MONTHLY,
        ),
        ControlTemplate(
            "Journal entry approval over threshold",
            "Journal entries above the materiality threshold require independent approval.",
            ControlCategory.APPROVAL_WORKFLOW,
            ControlFrequency.CONTINUOUS,
        ),
        ControlTemplate(
            "Bank account reconciliation",
            "Bank statements are matched to the ledger and exceptions are cleared.",
            ControlCategory.RECONCILIATION,
            ControlFrequency.MONTHLY,
        ),
        ControlTemplate(
            "Segregation of AP payment approval",
            "Payment creation and payment approval are performed by different users.",
            ControlCategory.SEGREGATION_OF_DUTIES,
            ControlFrequency.CONTINUOUS,
        ),
        ControlTemplate(
            "Finance policy attestation",
            "Finance staff confirm annual attestation of key financial policies.",
            ControlCategory.TRAINING_AWARENESS,
            ControlFrequency.ANNUAL,
        ),
    ),
    Department.PROCUREMENT: (
        ControlTemplate(
            "Three-way match on purchase orders",
            "Invoice, purchase order and goods receipt are matched before payment.",
            ControlCategory.RECONCILIATION,
            ControlFrequency.CONTINUOUS,
        ),
        ControlTemplate(
            "Vendor onboarding due diligence",
            "New vendors complete ownership, financial and compliance checks.",
            ControlCategory.VENDOR_MANAGEMENT,
            ControlFrequency.AD_HOC,
        ),
        ControlTemplate(
            "Purchase order approval limits",
            "Orders are approved within delegated authority limits.",
            ControlCategory.APPROVAL_WORKFLOW,
            ControlFrequency.CONTINUOUS,
        ),
        ControlTemplate(
            "Preferred supplier list review",
            "The preferred supplier list is reviewed and refreshed.",
            ControlCategory.VENDOR_MANAGEMENT,
            ControlFrequency.QUARTERLY,
        ),
        ControlTemplate(
            "Goods receipt verification",
            "Receipts are confirmed by someone other than the requester.",
            ControlCategory.SEGREGATION_OF_DUTIES,
            ControlFrequency.CONTINUOUS,
        ),
    ),
    Department.HUMAN_RESOURCES: (
        ControlTemplate(
            "Payroll change authorization",
            "All payroll changes are approved before processing.",
            ControlCategory.APPROVAL_WORKFLOW,
            ControlFrequency.MONTHLY,
        ),
        ControlTemplate(
            "Time and attendance approval",
            "Overtime and absence entries are approved by line managers.",
            ControlCategory.APPROVAL_WORKFLOW,
            ControlFrequency.WEEKLY,
        ),
        ControlTemplate(
            "HR data access review",
            "Access to employee records is reviewed each quarter.",
            ControlCategory.ACCESS_MANAGEMENT,
            ControlFrequency.QUARTERLY,
        ),
        ControlTemplate(
            "Mandatory training completion",
            "All staff complete mandatory compliance training annually.",
            ControlCategory.TRAINING_AWARENESS,
            ControlFrequency.ANNUAL,
        ),
        ControlTemplate(
            "Employee data retention check",
            "Employee records are retained and disposed of per policy.",
            ControlCategory.DATA_PROTECTION,
            ControlFrequency.ANNUAL,
        ),
    ),
    Department.IT: (
        ControlTemplate(
            "Privileged access review",
            "Privileged accounts are reviewed and recertified quarterly.",
            ControlCategory.ACCESS_MANAGEMENT,
            ControlFrequency.QUARTERLY,
        ),
        ControlTemplate(
            "Change management approval",
            "Production changes require approval and testing evidence.",
            ControlCategory.CHANGE_MANAGEMENT,
            ControlFrequency.CONTINUOUS,
        ),
        ControlTemplate(
            "Backup restoration testing",
            "Backups are restored and verified at least quarterly.",
            ControlCategory.DATA_PROTECTION,
            ControlFrequency.QUARTERLY,
        ),
        ControlTemplate(
            "Vendor remote access control",
            "Third-party remote access is time-bound and monitored.",
            ControlCategory.ACCESS_MANAGEMENT,
            ControlFrequency.CONTINUOUS,
        ),
        ControlTemplate(
            "Security patch compliance",
            "Critical patches are applied within the defined window.",
            ControlCategory.CHANGE_MANAGEMENT,
            ControlFrequency.WEEKLY,
        ),
    ),
    Department.OPERATIONS: (
        ControlTemplate(
            "Inventory count reconciliation",
            "Physical counts are reconciled to system records.",
            ControlCategory.RECONCILIATION,
            ControlFrequency.MONTHLY,
        ),
        ControlTemplate(
            "Shipment documentation check",
            "Shipping documents are matched to orders before dispatch.",
            ControlCategory.RECONCILIATION,
            ControlFrequency.CONTINUOUS,
        ),
        ControlTemplate(
            "Warehouse access control",
            "Physical access to the warehouse is restricted and logged.",
            ControlCategory.PHYSICAL_SECURITY,
            ControlFrequency.CONTINUOUS,
        ),
        ControlTemplate(
            "Equipment maintenance schedule",
            "Preventive maintenance is completed on schedule.",
            ControlCategory.PHYSICAL_SECURITY,
            ControlFrequency.QUARTERLY,
        ),
        ControlTemplate(
            "Contractor induction completion",
            "Contractors complete site induction before work begins.",
            ControlCategory.TRAINING_AWARENESS,
            ControlFrequency.AD_HOC,
        ),
    ),
    Department.COMPLIANCE: (
        ControlTemplate(
            "Sanctions screening",
            "Counterparties are screened against sanctions lists.",
            ControlCategory.VENDOR_MANAGEMENT,
            ControlFrequency.CONTINUOUS,
        ),
        ControlTemplate(
            "Policy exception approval",
            "Exceptions to policy are documented and approved.",
            ControlCategory.APPROVAL_WORKFLOW,
            ControlFrequency.AD_HOC,
        ),
        ControlTemplate(
            "Records retention compliance",
            "Records are retained and disposed of according to the retention schedule.",
            ControlCategory.DATA_PROTECTION,
            ControlFrequency.ANNUAL,
        ),
        ControlTemplate(
            "Regulatory reporting review",
            "Regulatory returns are reviewed and signed off before submission.",
            ControlCategory.APPROVAL_WORKFLOW,
            ControlFrequency.QUARTERLY,
        ),
        ControlTemplate(
            "Third-party due diligence review",
            "High-risk third parties are re-screened on a periodic cycle.",
            ControlCategory.VENDOR_MANAGEMENT,
            ControlFrequency.QUARTERLY,
        ),
    ),
}

CATEGORY_LABELS: dict[ControlCategory, str] = {
    ControlCategory.ACCESS_MANAGEMENT: "access management",
    ControlCategory.SEGREGATION_OF_DUTIES: "segregation of duties",
    ControlCategory.RECONCILIATION: "reconciliation",
    ControlCategory.APPROVAL_WORKFLOW: "approval workflow",
    ControlCategory.CHANGE_MANAGEMENT: "change management",
    ControlCategory.VENDOR_MANAGEMENT: "vendor management",
    ControlCategory.DATA_PROTECTION: "data protection",
    ControlCategory.PHYSICAL_SECURITY: "physical security",
    ControlCategory.TRAINING_AWARENESS: "training awareness",
}

# Plausible root causes for a finding raised against each control category.
ROOT_CAUSE_BY_CATEGORY: dict[ControlCategory, tuple[RootCauseCategory, ...]] = {
    ControlCategory.ACCESS_MANAGEMENT: (
        RootCauseCategory.SEGREGATION_OF_DUTIES,
        RootCauseCategory.POLICY_NON_COMPLIANCE,
        RootCauseCategory.PROCESS_GAP,
        RootCauseCategory.SYSTEM_LIMITATION,
    ),
    ControlCategory.SEGREGATION_OF_DUTIES: (
        RootCauseCategory.SEGREGATION_OF_DUTIES,
        RootCauseCategory.POLICY_NON_COMPLIANCE,
    ),
    ControlCategory.RECONCILIATION: (
        RootCauseCategory.PROCESS_GAP,
        RootCauseCategory.DATA_QUALITY,
        RootCauseCategory.HUMAN_ERROR,
    ),
    ControlCategory.APPROVAL_WORKFLOW: (
        RootCauseCategory.POLICY_NON_COMPLIANCE,
        RootCauseCategory.PROCESS_GAP,
        RootCauseCategory.HUMAN_ERROR,
    ),
    ControlCategory.CHANGE_MANAGEMENT: (
        RootCauseCategory.PROCESS_GAP,
        RootCauseCategory.SYSTEM_LIMITATION,
        RootCauseCategory.POLICY_NON_COMPLIANCE,
    ),
    ControlCategory.VENDOR_MANAGEMENT: (
        RootCauseCategory.PROCESS_GAP,
        RootCauseCategory.EXTERNAL_FACTOR,
        RootCauseCategory.DATA_QUALITY,
    ),
    ControlCategory.DATA_PROTECTION: (
        RootCauseCategory.POLICY_NON_COMPLIANCE,
        RootCauseCategory.SYSTEM_LIMITATION,
        RootCauseCategory.HUMAN_ERROR,
    ),
    ControlCategory.PHYSICAL_SECURITY: (
        RootCauseCategory.POLICY_NON_COMPLIANCE,
        RootCauseCategory.HUMAN_ERROR,
        RootCauseCategory.PROCESS_GAP,
    ),
    ControlCategory.TRAINING_AWARENESS: (
        RootCauseCategory.HUMAN_ERROR,
        RootCauseCategory.PROCESS_GAP,
        RootCauseCategory.POLICY_NON_COMPLIANCE,
    ),
}


@dataclass(frozen=True)
class FindingTemplate:
    titles: tuple[str, ...]
    description: str
    action: str


FINDING_TEMPLATES: dict[RootCauseCategory, FindingTemplate] = {
    RootCauseCategory.PROCESS_GAP: FindingTemplate(
        titles=(
            "Undocumented handover in {area}",
            "Approval step missing from the {area} process",
            "{area} procedure not followed consistently",
        ),
        description=(
            "Testing of {control} identified {exceptions} exception(s) in a sample "
            "of {sample}. The sequence of review and approval is not documented, "
            "so evidence that the control operated is incomplete."
        ),
        action=(
            "Document the revised {area} procedure, obtain approval, and brief "
            "the process team."
        ),
    ),
    RootCauseCategory.HUMAN_ERROR: FindingTemplate(
        titles=(
            "Manual entry errors in {area}",
            "Repeated keying mistakes in {area}",
            "Reviewer missed exceptions in {area}",
        ),
        description=(
            "Testing of {control} identified {exceptions} exception(s) in a sample "
            "of {sample}, caused by manual data entry mistakes. The errors were "
            "corrected after detection but were not prevented."
        ),
        action=(
            "Add validation checks to the {area} input form and retrain the team "
            "on the revised procedure."
        ),
    ),
    RootCauseCategory.SYSTEM_LIMITATION: FindingTemplate(
        titles=(
            "System control not configurable for {area}",
            "Legacy tool lacks an audit trail for {area}",
            "Manual workaround required for {area}",
        ),
        description=(
            "The system supporting {control} cannot enforce the required "
            "validation, so the control depends on manual effort. Testing "
            "identified {exceptions} exception(s) in a sample of {sample}."
        ),
        action=(
            "Raise a system change request to enforce validation in the {area} "
            "workflow."
        ),
    ),
    RootCauseCategory.POLICY_NON_COMPLIANCE: FindingTemplate(
        titles=(
            "Policy exception granted without approval in {area}",
            "Mandatory check skipped for {area}",
            "Delegated authority limit exceeded in {area}",
        ),
        description=(
            "The {control} check was not performed for {exceptions} of {sample} "
            "sampled items, contrary to the documented policy. No compensating "
            "review was evidenced."
        ),
        action=(
            "Reissue the {area} policy, confirm acknowledgement, and add a "
            "monthly compliance check."
        ),
    ),
    RootCauseCategory.SEGREGATION_OF_DUTIES: FindingTemplate(
        titles=(
            "Incompatible duties held by one user in {area}",
            "Approval and posting performed by the same person in {area}",
        ),
        description=(
            "Access review for {control} found {exceptions} user(s) in a sample of "
            "{sample} holding incompatible roles, allowing the same person to "
            "initiate and approve a transaction."
        ),
        action=(
            "Reassign incompatible roles in {area} and update the access matrix."
        ),
    ),
    RootCauseCategory.DATA_QUALITY: FindingTemplate(
        titles=(
            "Incomplete master data for {area}",
            "Duplicate records identified in {area}",
            "Stale reference data in {area}",
        ),
        description=(
            "Testing of {control} identified {exceptions} incomplete or duplicate "
            "record(s) in a sample of {sample}, reducing the reliability of "
            "downstream reporting."
        ),
        action=(
            "Cleanse the {area} master data and introduce a periodic data "
            "quality review."
        ),
    ),
    RootCauseCategory.EXTERNAL_FACTOR: FindingTemplate(
        titles=(
            "Third-party delay affecting {area}",
            "Regulatory change not yet reflected in {area}",
        ),
        description=(
            "{control} was affected by a dependency outside the organisation's "
            "direct control. Testing identified {exceptions} exception(s) in a "
            "sample of {sample}."
        ),
        action=(
            "Agree a remediation timeline with the third party and add a "
            "contractual service checkpoint."
        ),
    ),
}

AUDIT_TITLE_TEMPLATES: dict[AuditType, tuple[str, ...]] = {
    AuditType.FINANCIAL: (
        "{department} financial controls audit",
        "Revenue and expenditure review - {department}",
    ),
    AuditType.OPERATIONAL: (
        "{department} operational process audit",
        "{department} efficiency and control review",
    ),
    AuditType.COMPLIANCE: (
        "{department} regulatory compliance review",
        "{department} policy compliance audit",
    ),
    AuditType.IT: (
        "{department} system controls review",
        "IT general controls review - {department}",
    ),
    AuditType.SPECIAL_REVIEW: (
        "Special review: {department} exception",
        "{department} incident follow-up review",
    ),
    AuditType.FOLLOW_UP: (
        "{department} remediation follow-up",
        "Follow-up on prior {department} findings",
    ),
}

# Base remediation window by severity, before the department speed multiplier.
REMEDIATION_DAYS_BY_SEVERITY: dict[FindingSeverity, int] = {
    FindingSeverity.LOW: 30,
    FindingSeverity.MEDIUM: 45,
    FindingSeverity.HIGH: 60,
    FindingSeverity.CRITICAL: 90,
}
