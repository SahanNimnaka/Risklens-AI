"""Project configuration tests.

They pin the behaviour that caused earlier bugs: settings must resolve the
root ``.env`` regardless of the working directory, synthetic defaults must be
fixed, and the test session must never point at the development database.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

from sqlalchemy.engine import make_url

from app.core.config import ENV_FILE, PROJECT_ROOT, settings


def test_env_file_is_resolved_from_the_repository_root():
    assert ENV_FILE == PROJECT_ROOT / ".env"
    assert ENV_FILE.is_absolute()
    assert ENV_FILE.exists()


def test_synthetic_defaults_are_deterministic():
    assert settings.synthetic_data_seed == 42
    assert settings.synthetic_data_reference_date == date(2026, 10, 31)


def test_tests_run_against_the_dedicated_database():
    url = make_url(settings.database_url)
    assert url.database == "risklens_ai_test"
    assert url.database.endswith("_test")


def test_project_root_points_at_the_repository():
    assert (PROJECT_ROOT / "alembic.ini").exists()
    assert (PROJECT_ROOT / "backend" / "app").is_dir()
    assert isinstance(PROJECT_ROOT, Path)
