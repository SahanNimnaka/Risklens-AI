"""Corrective action plan model."""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    ForeignKey,
    Identity,
    Index,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ActionStatus
from app.models.mixins import TimestampMixin
from app.models.types import enum_type

if TYPE_CHECKING:
    from app.models.finding import Finding


class ActionPlan(TimestampMixin, Base):
    """Corrective action owned by a business area for a single finding.

    A finding may have zero, one, or several action plans. A completed action
    must record a completion date; completing late (after ``due_date``) is
    valid data and is intentionally not prevented.
    """

    __tablename__ = "action_plans"
    __table_args__ = (
        CheckConstraint(
            "status <> 'completed' OR completion_date IS NOT NULL",
            name="completed_requires_completion_date",
        ),
        Index("ix_action_plans_status_due_date", "status", "due_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    finding_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("findings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action_description: Mapped[str] = mapped_column(Text, nullable=False)
    assigned_owner: Mapped[str] = mapped_column(String(120), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[ActionStatus] = mapped_column(
        enum_type(ActionStatus, "action_status"),
        nullable=False,
        default=ActionStatus.NOT_STARTED,
    )
    completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    finding: Mapped["Finding"] = relationship(back_populates="action_plans")
