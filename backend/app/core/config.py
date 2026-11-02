from datetime import date
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# The .env file lives at the repository root, next to backend/.
# Resolving it from this file (instead of the current working directory)
# means config loads the same way from the repo root, from backend/, and
# from pytest.
PROJECT_ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    app_name: str = "RiskLens AI"
    app_version: str = "0.1.0"
    database_url: str

    # Synthetic dataset defaults. The reference date is fixed so generation
    # and risk calculations are reproducible; Phase 2 takes an explicit
    # as_of date instead of reading the system clock.
    synthetic_data_seed: int = 42
    synthetic_data_reference_date: date = date(2026, 10, 31)

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
