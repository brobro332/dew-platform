from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.routers import news, settings as settings_router, words
from app.services.scheduler import shutdown_scheduler, start_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """FastAPI Lifespan: 시작 시 DB 스키마 확인 및 APScheduler 구동, 종료 시 스케줄러 정지."""
    init_db()
    start_scheduler()
    yield
    shutdown_scheduler()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "🌱 Dew Platform — 나를 케어하는 AI 지식·인사이트 비서 백엔드 API "
        "(나만의 단어사전 + 5대 분야 일일 주요뉴스 눈높이 브리핑 + 디스코드 알림)"
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(settings_router.router)
app.include_router(words.router)
app.include_router(news.router)


@app.get("/health", tags=["Health"])
def health_check():
    """서버 상태 및 스케줄러 타임존 확인용 헬스체크 엔드포인트."""
    return {
        "status": "ok",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "timezone": settings.TZ,
    }
