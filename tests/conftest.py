"""Test configuration for RiskLens AI.

Every test runs against a dedicated PostgreSQL database, ``risklens_ai_test``.
The URL is derived from the root ``.env`` and the database name is overridden
*before* the application config is imported, so no test can reach the
development database by accident.

The database is dropped and recreated at the start of each test session and
migrated with the real Alembic history. Each test then runs inside a
transaction that is rolled back, so tests are isolated and repeatable.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from dotenv import dotenv_values
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

REPO_ROOT = Path(__file__).resolve().parents[1]
TEST_DB_NAME = "risklens_ai_test"


def _resolve_test_url() -> str:
    env_file = REPO_ROOT / ".env"
    if not env_file.exists():
        raise RuntimeError(
            f"Missing {env_file}. Copy .env.example to .env before running tests."
        )

    values = dotenv_values(env_file)
    base_url = os.environ.get("DATABASE_URL") or values.get("DATABASE_URL")
    if not base_url:
        raise RuntimeError("DATABASE_URL is not configured in the environment or .env")

    url = make_url(base_url).set(database=TEST_DB_NAME)
    if url.database != TEST_DB_NAME or not url.database.endswith("_test"):
        raise RuntimeError(
            f"Refusing to run tests against {url.database!r}; expected {TEST_DB_NAME!r}"
        )
    return url.render_as_string(hide_password=False)


TEST_DATABASE_URL = _resolve_test_url()
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

# Imported only after the environment override above is in place.
from app.core.config import settings  # noqa: E402

if settings.database_url != TEST_DATABASE_URL:
    raise RuntimeError(
        "Application settings did not pick up the test database URL: "
        f"{settings.database_url!r}"
    )


def _admin_engine():
    url = make_url(TEST_DATABASE_URL)
    return create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")


def _recreate_database() -> None:
    url = make_url(TEST_DATABASE_URL)
    name = url.database
    if name != TEST_DB_NAME or not name.endswith("_test"):
        raise RuntimeError(f"Refusing to drop database {name!r}")

    engine = _admin_engine()
    try:
        with engine.connect() as connection:
            connection.execute(
                text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = :name AND pid <> pg_backend_pid()"
                ),
                {"name": name},
            )
            connection.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
            connection.execute(text(f'CREATE DATABASE "{name}"'))
    finally:
        engine.dispose()


def _upgrade_schema() -> None:
    config = Config(str(REPO_ROOT / "alembic.ini"))
    command.upgrade(config, "head")


@pytest.fixture(scope="session")
def engine():
    """Session-wide engine bound to a freshly migrated test database."""
    _recreate_database()
    _upgrade_schema()

    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def db_session(engine):
    """One transaction per test, rolled back afterwards.

    ``join_transaction_mode="create_savepoint"`` lets code under test call
    ``session.commit()`` (the loader does) without committing the outer
    transaction, so the database is left untouched.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection,
        join_transaction_mode="create_savepoint",
        expire_on_commit=False,
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
