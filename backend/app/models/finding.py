"""Audit finding model."""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Date, ForeignKey, Identity, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import FindingSeverity, FindingStatus, RootCauseCategory
from app.models.mixins import TimestampMixin
from app.models.types import enum_type

if TYPE_CHECKING:
    from app.models.action_plan import ActionPlan
    from app.models.audit import Audit
    from app.models.control import Control


class Finding(TimestampMixin, Base):
    """An issue raised by an audit.

    ``control_id`` is optional because not every finding maps to a documented
    control. Deleting an audit removes its findings; deleting a control only
    detaches it, because the finding remains a valid audit result.
    """

    __tablename__ = "findings"
    __table_args__ = (
        Index("ix_findings_audit_identified_date", "audit_id", "identified_date"),
        Index("ix_findings_severity_status", "severity", "status"),
        Index(
            "ix_findings_root_cause_identified_date",
            "root_cause_category",
            "identified_date",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    finding_ref: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    audit_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("audits.id", ondelete="CASCADE"),
        nullable=False,
    )
    control_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("controls.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[FindingSeverity] = mapped_column(
        enum_type(FindingSeverity, "finding_severity"),
        nullable=False,
    )
    status: Mapped[FindingStatus] = mapped_column(
        enum_type(FindingStatus, "finding_status"),
        nullable=False,
    )
    root_cause_category: Mapped[RootCauseCategory] = mapped_column(
        enum_type(RootCauseCategory, "root_cause_category"),
        nullable=False,
    )
    evidence_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    identified_date: Mapped[date] = mapped_column(Date, nullable=False)

    audit: Mapped["Audit"] = relationship(back_populates="findings")
    control: Mapped["Control | None"] = relationship(back_populates="findings")
    action_plans: Mapped[list["ActionPlan"]] = relationship(
        back_populates="finding",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
