"""Audit engagement model."""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, CheckConstraint, Date, Identity, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AuditStatus, AuditType, Department
from app.models.mixins import TimestampMixin
from app.models.types import enum_type

if TYPE_CHECKING:
    from app.models.finding import Finding


class Audit(TimestampMixin, Base):
    """A single internal audit engagement.

    ``end_date`` stays null while the engagement is still running, so the
    date-order CHECK permits it. ``audit_ref`` is the natural key the
    synthetic loader upserts on.
    """

    __tablename__ = "audits"
    __table_args__ = (
        CheckConstraint(
            "end_date IS NULL OR end_date >= start_date",
            name="end_date_after_start_date",
        ),
        Index("ix_audits_department_start_date", "department", "start_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    audit_ref: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    department: Mapped[Department] = mapped_column(
        enum_type(Department, "department"),
        nullable=False,
    )
    audit_type: Mapped[AuditType] = mapped_column(
        enum_type(AuditType, "audit_type"),
        nullable=False,
    )
    lead_auditor: Mapped[str] = mapped_column(String(120), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[AuditStatus] = mapped_column(
        enum_type(AuditStatus, "audit_status"),
        nullable=False,
        default=AuditStatus.PLANNED,
        server_default=text("'planned'"),
    )

    findings: Mapped[list["Finding"]] = relationship(
        back_populates="audit",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
