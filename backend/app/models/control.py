"""Business control model."""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Date, Identity, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    ControlCategory,
    ControlEffectiveness,
    ControlFrequency,
    ControlStatus,
    Department,
)
from app.models.mixins import TimestampMixin
from app.models.types import enum_type

if TYPE_CHECKING:
    from app.models.finding import Finding


class Control(TimestampMixin, Base):
    """A business control from the organisation's control library.

    ``status`` answers "is the control live?" while ``effectiveness`` answers
    "did the control work when tested?". Keeping them separate allows states
    such as "retired and ineffective" and gives Rule 6 a direct predicate.
    """

    __tablename__ = "controls"
    __table_args__ = (
        Index("ix_controls_department_category", "department", "category"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    control_ref: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    department: Mapped[Department] = mapped_column(
        enum_type(Department, "department"),
        nullable=False,
    )
    category: Mapped[ControlCategory] = mapped_column(
        enum_type(ControlCategory, "control_category"),
        nullable=False,
    )
    owner: Mapped[str] = mapped_column(String(120), nullable=False)
    frequency: Mapped[ControlFrequency] = mapped_column(
        enum_type(ControlFrequency, "control_frequency"),
        nullable=False,
    )
    status: Mapped[ControlStatus] = mapped_column(
        enum_type(ControlStatus, "control_status"),
        nullable=False,
        default=ControlStatus.ACTIVE,
        server_default=text("'active'"),
    )
    effectiveness: Mapped[ControlEffectiveness] = mapped_column(
        enum_type(ControlEffectiveness, "control_effectiveness"),
        nullable=False,
        default=ControlEffectiveness.NOT_TESTED,
        server_default=text("'not_tested'"),
    )
    last_tested_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    findings: Mapped[list["Finding"]] = relationship(
        back_populates="control",
        passive_deletes=True,
    )
