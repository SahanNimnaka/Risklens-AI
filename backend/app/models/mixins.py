"""Column mixins shared by the audit models."""

from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column


class TimestampMixin:
    """Audit-trail timestamps managed by the database/session.

    ``created_at`` is set by the database on insert. ``updated_at`` is set on
    insert and refreshed by SQLAlchemy on ORM updates. Direct Core/bulk
    updates bypass ``onupdate`` and must set the column explicitly.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
