from pydantic import BaseModel
import os

class AppSettings(BaseModel):
    database_path: str = os.getenv("DATABASE_PATH", "./app.db")
    sounds_dir: str = os.getenv("SOUNDS_DIR", "./sounds")
    cors_allow_origins: str = os.getenv("CORS_ALLOW_ORIGINS", "*")

settings = AppSettings()
