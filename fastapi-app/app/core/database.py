import logging
from typing import Generator
from sqlmodel import Session, SQLModel, create_engine
from app.core.config import settings

logger = logging.getLogger(__name__)

# SQLAlchemy 2.0 / SQLModel Engine 생성
engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
)


def init_db() -> None:
    """엔티티 모델 기반 테이블 생성 확인 (init/01_schema.sql 보완용)."""
    # 모든 모델을 import 하여 SQLModel.metadata에 등록
    import app.models  # noqa: F401

    try:
        SQLModel.metadata.create_all(engine)
        logger.info("Database schema verified successfully.")
    except Exception as exc:
        logger.warning(
            "Database connection unavailable at startup (%s). "
            "Make sure PostgreSQL is running via docker-compose.",
            exc,
        )


def get_session() -> Generator[Session, None, None]:
    """FastAPI Depends용 DB 세션 제너레이터."""
    with Session(engine) as session:
        yield session
