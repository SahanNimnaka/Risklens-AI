from fastapi import FastAPI
from sqlalchemy import text

from app.api.anomaly import router as anomaly_router
from app.api.risk import router as risk_router
from app.core.config import settings
from app.db.session import engine


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
)

app.include_router(risk_router)
app.include_router(anomaly_router)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "application": settings.app_name,
    }


@app.get("/health/database")
def database_health_check():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "database": "connected",
        }

    except Exception:
        return {
            "status": "unhealthy",
            "database": "disconnected",
        }