from datetime import date, datetime, timedelta
import logging
from typing import List
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import text
from sqlmodel import Session, select

from app.core.config import settings
from app.core.database import engine
from app.models.news import DailyNews, UserNewsScrap
from app.models.setting import CareSetting
from app.models.user import AppUser
from app.models.word import WordEntry
from app.services.ai_engine import generate_briefings_step2, select_top_news_step1
from app.services.discord_notifier import (
    build_daily_briefing_payload,
    build_weekly_care_reminder_payload,
    send_discord_webhook,
)
from app.services.rss_collector import (
    collect_rss_candidates,
    enrich_missing_summaries_with_naver,
)


logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone=settings.TZ)


async def run_daily_news_pipeline(target_date: date | None = None) -> List[DailyNews]:
    """
    섹션 2.3 & 5.1: 하루 1회 전 유저 공통 주요뉴스 수집 및 2-Step AI 눈높이 브리핑 생성 파이프라인.
    """
    briefing_date = target_date or datetime.now().date()

    # 1. 멀티 RSS 후보 수집 (0 토큰)
    candidates = await collect_rss_candidates(max_candidates=45)
    if not candidates:
        logger.warning("No RSS candidates collected.")
        return []

    # 2. 1차 AI 선별 (제목만 넣고 5개 분야 × 3건 = 15건 추림)
    selected_pairs = await select_top_news_pipeline(candidates)

    # 3. 요약문 없는 기사(한국경제 등) 네이버 뉴스 검색 API로 보강
    selected_candidates = [cand for _, cand in selected_pairs]
    await enrich_missing_summaries_with_naver(selected_candidates)

    # 4. 2차 AI 상세 브리핑 & 핵심 용어 추출
    briefings_map = await generate_briefings_step2(selected_pairs)

    saved_items: List[DailyNews] = []
    with Session(engine) as session:
        for category, cand in selected_pairs:
            existing = session.exec(
                select(DailyNews).where(DailyNews.original_url == cand.original_url)
            ).first()
            ai_data = briefings_map.get(cand.candidate_id, {})

            if existing:
                existing.briefing_date = briefing_date
                existing.category = category
                existing.ai_briefing = ai_data.get("ai_briefing", existing.ai_briefing)
                existing.extracted_terms = ai_data.get(
                    "extracted_terms", existing.extracted_terms
                )
                session.add(existing)
                saved_items.append(existing)
            else:
                news_row = DailyNews(
                    briefing_date=briefing_date,
                    category=category,
                    press_name=cand.press_name,
                    title=cand.title,
                    original_url=cand.original_url,
                    thumbnail_url=cand.thumbnail_url,
                    summary_raw=cand.summary_raw,
                    ai_briefing=ai_data.get("ai_briefing", {}),
                    extracted_terms=ai_data.get("extracted_terms", []),
                )
                session.add(news_row)
                saved_items.append(news_row)

        session.commit()
        for item in saved_items:
            session.refresh(item)

    logger.info(
        "Daily news pipeline completed: %d articles saved for %s.",
        len(saved_items),
        briefing_date,
    )
    return saved_items


async def select_top_news_pipeline(candidates):
    return await select_top_news_step1(candidates)


async def cleanup_expired_unscrapped_news() -> int:
    """
    섹션 5.1: 미저장 뉴스 자동 삭제 (Multi-User Safe TTL 스케줄러)
    매일 자정 실행되어 어느 유저도 스크랩하지 않은(NOT EXISTS) 기한 경과 임시 뉴스만 삭제합니다.
    """
    cutoff_date = datetime.now().date() - timedelta(days=settings.TTL_RETENTION_DAYS)
    stmt = text(
        """
        DELETE FROM daily_news dn
        WHERE dn.briefing_date < :cutoff_date
          AND NOT EXISTS (
              SELECT 1 FROM user_news_scrap uns WHERE uns.news_id = dn.id
          )
        """
    )
    with Session(engine) as session:
        result = session.exec(stmt, params={"cutoff_date": cutoff_date})
        session.commit()
        deleted = result.rowcount if result.rowcount is not None else 0
        logger.info("TTL cleanup completed: %d expired news deleted.", deleted)
        return deleted


async def dispatch_scheduled_discord_briefings() -> None:
    """활성화된 유저들의 설정 시각에 맞춰 오늘의 브리핑을 디스코드 웹훅으로 발송합니다."""
    now_hm = datetime.now().strftime("%H:%M")
    today = datetime.now().date()

    with Session(engine) as session:
        due_settings = session.exec(
            select(CareSetting).where(
                CareSetting.is_active == True,  # noqa: E712
                CareSetting.daily_cron_time == now_hm,
            )
        ).all()

        if not due_settings:
            return

        today_news = session.exec(
            select(DailyNews).where(DailyNews.briefing_date == today)
        ).all()

        for user_setting in due_settings:
            if not user_setting.discord_webhook_url:
                continue
            payload = build_daily_briefing_payload(
                briefing_date=today,
                news_items=list(today_news),
                active_categories=user_setting.active_categories,
            )
            await send_discord_webhook(user_setting.discord_webhook_url, payload)


async def dispatch_weekly_care_reminders() -> None:
    """
    섹션 1.3 시너지 기능 3: 주간 지식 리마인드 브리핑 (Weekly Care)
    매주 금요일/일요일 저녁, 최근 7일간 새로 수집한 단어와 스크랩 뉴스를 요약해 디스코드로 발송합니다.
    """
    since_dt = datetime.now() - timedelta(days=7)

    with Session(engine) as session:
        enabled_settings = session.exec(
            select(CareSetting).where(
                CareSetting.is_active == True,  # noqa: E712
                CareSetting.weekly_remind_enabled == True,  # noqa: E712
            )
        ).all()

        for user_setting in enabled_settings:
            if not user_setting.discord_webhook_url:
                continue
            user = session.get(AppUser, user_setting.user_id)
            nickname = user.nickname if user else "Dew 케어러"

            recent_words = list(
                session.exec(
                    select(WordEntry)
                    .where(
                        WordEntry.user_id == user_setting.user_id,
                        WordEntry.created_at >= since_dt,
                    )
                    .order_by(WordEntry.created_at.desc())
                ).all()
            )
            recent_scrap_rows = session.exec(
                select(DailyNews)
                .join(UserNewsScrap, UserNewsScrap.news_id == DailyNews.id)
                .where(
                    UserNewsScrap.user_id == user_setting.user_id,
                    UserNewsScrap.created_at >= since_dt,
                )
                .order_by(UserNewsScrap.created_at.desc())
            ).all()

            payload = build_weekly_care_reminder_payload(
                nickname=nickname,
                recent_words=recent_words,
                recent_scraps=list(recent_scrap_rows),
            )
            await send_discord_webhook(user_setting.discord_webhook_url, payload)


def start_scheduler() -> None:
    """FastAPI Lifespan 시작 시 백그라운드 스케줄러를 구동합니다."""
    if scheduler.running:
        return

    # 1. 매일 아침 공통 뉴스 수집 & AI 브리핑 생성 (기본 06:50 KST)
    scheduler.add_job(
        run_daily_news_pipeline,
        trigger="cron",
        hour=settings.DAILY_COLLECTION_CRON_HOUR,
        minute=settings.DAILY_COLLECTION_CRON_MINUTE,
        id="daily_news_collection",
        replace_existing=True,
    )

    # 2. 매일 자정 미스크랩 기한 경과 뉴스 자동 삭제 (00:05 KST)
    scheduler.add_job(
        cleanup_expired_unscrapped_news,
        trigger="cron",
        hour=0,
        minute=5,
        id="midnight_ttl_cleanup",
        replace_existing=True,
    )

    # 3. 매 분 유저별 설정 시각(daily_cron_time) 체크 후 디스코드 알림 발송
    scheduler.add_job(
        dispatch_scheduled_discord_briefings,
        trigger="cron",
        minute="*",
        id="user_discord_dispatch",
        replace_existing=True,
    )

    # 4. 매주 금/일 20:00 KST 주간 지식 리마인드 브리핑 발송 (Weekly Care)
    scheduler.add_job(
        dispatch_weekly_care_reminders,
        trigger="cron",
        day_of_week="fri,sun",
        hour=20,
        minute=0,
        id="weekly_care_reminder",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("APScheduler started (timezone=%s).", settings.TZ)



def shutdown_scheduler() -> None:
    """FastAPI Lifespan 종료 시 백그라운드 스케줄러를 안전하게 정지합니다."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler shut down.")
