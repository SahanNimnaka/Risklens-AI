from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, text

class Settings(BaseSettings):
    database_url: str
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
engine = create_engine(settings.database_url)

try:
    with engine.connect() as connection:
        result = connection.execute(text("SELECT current_database(), current_user"))
        database, user = result.fetchone()
        print(f"Connection successful: database={database}, user={user}")
except Exception as error:
    print(f"Connection failed: {type(error).__name__}: {error}")
finally:
    engine.dispose()
