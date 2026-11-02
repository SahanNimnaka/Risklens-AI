"""Reusable SQLAlchemy type helpers for the model layer."""

from enum import StrEnum

from sqlalchemy import Enum as SAEnum


def enum_type(enum_cls: type[StrEnum], name: str, *, length: int = 32) -> SAEnum:
    """Build a ``VARCHAR`` + ``CHECK`` column type for a Python enum.

    ``native_enum=False`` is deliberate: PostgreSQL native enum types cannot
    have values removed and ``ALTER TYPE ... ADD VALUE`` cannot run inside the
    transaction Alembic uses. A CHECK constraint is cheap to replace.

    ``values_callable`` stores ``member.value`` (lowercase) instead of
    ``member.name``, so the database vocabulary matches the API vocabulary.

    ``create_constraint`` must be requested explicitly: SQLAlchemy 2.x
    defaults it to ``False``, which would leave the column an unconstrained
    VARCHAR.
    """
    return SAEnum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=length,
        validate_strings=True,
        values_callable=lambda members: [member.value for member in members],
    )
