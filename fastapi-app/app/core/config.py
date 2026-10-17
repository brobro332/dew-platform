from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


# 프로젝트 루트(.env) 및 fastapi-app/.env 모두 탐색
ROOT_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
LOCAL_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """Dew Platform 환경설정 (pydantic-settings 기반)."""

    APP_NAME: str = "Dew Platform API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # 1. Database (기본: PostgreSQL, 로컬 단독 테스트 시 SQLite 폴백도 가능)
    DATABASE_URL: str = (
        "postgresql+psycopg2://dew_user:dew_secret_pw@localhost:5432/dew_platform"
    )

    # 2. Cloudflare Zero Trust & Local Dev Auth Fallback
    DEV_DEFAULT_EMAIL: str = "dev@dew.local"
    DEV_DEFAULT_NICKNAME: str = "Dew 케어러"

    # 3. Naver Search Official Open API
    NAVER_CLIENT_ID: str = ""
    NAVER_CLIENT_SECRET: str = ""

    # 4. Hybrid AI Engine Keys
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    ANTIGRAVITY_TIMEOUT_SECONDS: float = 30.0

    # 5. Scheduler & News Pipeline Settings
    TZ: str = "Asia/Seoul"
    DAILY_COLLECTION_CRON_HOUR: int = 6
    DAILY_COLLECTION_CRON_MINUTE: int = 50
    TTL_RETENTION_DAYS: int = 3

    # 5대 표준 뉴스 카테고리
    STANDARD_NEWS_CATEGORIES: List[str] = [
        "경제/금융",
        "증권/부동산",
        "IT/테크",
        "사회/생활",
        "글로벌",
    ]

    # CORS 허용 오리진
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    model_config = SettingsConfigDict(
        env_file=(str(ROOT_ENV_PATH), str(LOCAL_ENV_PATH)),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
