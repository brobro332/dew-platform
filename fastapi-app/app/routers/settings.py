from datetime import datetime, timedelta
from typing import Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.database import get_session
from app.models.news import DailyNews, UserNewsScrap
from app.models.setting import CareSetting, CareSettingUpdateRequest
from app.models.user import AppUser, UserProfileResponse, UserProfileUpdateRequest
from app.models.word import WordEntry
from app.services.discord_notifier import (
    build_daily_briefing_payload,
    build_weekly_care_reminder_payload,
    send_discord_webhook,
)

router = APIRouter(prefix="/api", tags=["Profile & Care Settings (계정 및 알림 설정)"])



@router.get("/me", response_model=UserProfileResponse)
def get_my_profile(
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> UserProfileResponse:
    """
    현재 Cloudflare Zero Trust 인증 유저 정보를 조회합니다.
    (최초 호출 시 get_current_user 의존성에서 JIT Provisioning으로 계정이 자동 생성됩니다.)
    """
    word_count = (
        session.exec(
            select(func.count(WordEntry.id)).where(
                WordEntry.user_id == current_user.id
            )
        ).one()
        or 0
    )
    scrap_count = (
        session.exec(
            select(func.count(UserNewsScrap.id)).where(
                UserNewsScrap.user_id == current_user.id
            )
        ).one()
        or 0
    )

    return UserProfileResponse(
        id=current_user.id,
        email=current_user.email,
        nickname=current_user.nickname,
        created_at=current_user.created_at,
        last_login_at=current_user.last_login_at,
        word_count=word_count,
        scrap_count=scrap_count,
    )


@router.get("/settings", response_model=CareSetting)
def get_care_settings(
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> CareSetting:
    """내 관심 뉴스 분야, 개인 알림 시각, 디스코드 웹훅 설정을 조회합니다."""
    care_setting = session.exec(
        select(CareSetting).where(CareSetting.user_id == current_user.id)
    ).first()
    if not care_setting:
        care_setting = CareSetting(
            user_id=current_user.id,
            active_categories=list(settings.STANDARD_NEWS_CATEGORIES),
        )
        session.add(care_setting)
        session.commit()
        session.refresh(care_setting)
    return care_setting


@router.put("/settings", response_model=CareSetting)
def update_care_settings(
    payload: CareSettingUpdateRequest,
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> CareSetting:
    """내 관심 분야, 개인 알림 시각(예: 07:30), 디스코드 웹훅 URL 설정을 변경합니다."""
    care_setting = session.exec(
        select(CareSetting).where(CareSetting.user_id == current_user.id)
    ).first()
    if not care_setting:
        care_setting = CareSetting(user_id=current_user.id)

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(care_setting, key, value)

    session.add(care_setting)
    session.commit()
    session.refresh(care_setting)
    return care_setting


@router.post("/notifications/test", response_model=Dict[str, object])
async def send_test_discord_notification(
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> Dict[str, object]:
    """내 디스코드 웹훅으로 테스트 브리핑(또는 당일 브리핑)을 즉시 발송합니다."""
    care_setting = session.exec(
        select(CareSetting).where(CareSetting.user_id == current_user.id)
    ).first()
    if not care_setting or not care_setting.discord_webhook_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="먼저 설정에서 디스코드 웹훅 URL(discord_webhook_url)을 등록해 주세요.",
        )

    latest_news = session.exec(
        select(DailyNews).order_by(DailyNews.briefing_date.desc())
    ).first()
    target_date = (
        latest_news.briefing_date if latest_news else datetime.now().date()
    )
    news_items = list(
        session.exec(
            select(DailyNews).where(DailyNews.briefing_date == target_date)
        ).all()
    )

    if news_items:
        payload = build_daily_briefing_payload(
            briefing_date=target_date,
            news_items=news_items,
            active_categories=care_setting.active_categories,
        )
    else:
        payload = {
            "username": "Dew AI 케어 비서",
            "content": "🌱 **Dew Platform 디스코드 알림 연동 테스트가 성공적으로 완료되었습니다!**",
            "embeds": [
                {
                    "title": "✅ 휴대폰 푸시 알림 준비 완료",
                    "description": (
                        f"• 설정된 알림 시각: 매일 **{care_setting.daily_cron_time}** (KST)\n"
                        f"• 구독 중인 관심 분야: `{', '.join(care_setting.active_categories)}`"
                    ),
                    "color": 3066993,
                }
            ],
        }

    ok = await send_discord_webhook(care_setting.discord_webhook_url, payload)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="디스코드 웹훅 발송에 실패했습니다. 웹훅 URL이 유효한지 확인해 주세요.",
        )
    return {"status": "sent", "target_date": str(target_date)}


@router.patch("/me", response_model=UserProfileResponse)
def update_my_profile(
    payload: UserProfileUpdateRequest,
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> UserProfileResponse:
    """현재 로그인 유저의 표시 닉네임(nickname)을 수정합니다."""
    cleaned = payload.nickname.strip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="닉네임을 입력해 주세요.",
        )
    current_user.nickname = cleaned[:100]
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return get_my_profile(session=session, current_user=current_user)


@router.post("/notifications/weekly-remind", response_model=Dict[str, object])
async def send_weekly_remind_notification(
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> Dict[str, object]:
    """
    섹션 1.3 시너지 기능 3: 최근 7일간 새로 수집한 단어와 스크랩 뉴스를 요약한
    '주간 지식 리마인드 브리핑(Weekly Care)' 카드를 내 디스코드로 즉시 발송합니다.
    """
    care_setting = session.exec(
        select(CareSetting).where(CareSetting.user_id == current_user.id)
    ).first()
    if not care_setting or not care_setting.discord_webhook_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="먼저 설정에서 디스코드 웹훅 URL(discord_webhook_url)을 등록해 주세요.",
        )

    since_dt = datetime.now() - timedelta(days=7)
    recent_words = list(
        session.exec(
            select(WordEntry)
            .where(
                WordEntry.user_id == current_user.id,
                WordEntry.created_at >= since_dt,
            )
            .order_by(WordEntry.created_at.desc())
        ).all()
    )
    recent_scraps = list(
        session.exec(
            select(DailyNews)
            .join(UserNewsScrap, UserNewsScrap.news_id == DailyNews.id)
            .where(
                UserNewsScrap.user_id == current_user.id,
                UserNewsScrap.created_at >= since_dt,
            )
            .order_by(UserNewsScrap.created_at.desc())
        ).all()
    )

    payload = build_weekly_care_reminder_payload(
        nickname=current_user.nickname,
        recent_words=recent_words,
        recent_scraps=recent_scraps,
    )
    ok = await send_discord_webhook(care_setting.discord_webhook_url, payload)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="디스코드 주간 리마인드 웹훅 발송에 실패했습니다.",
        )

    return {
        "status": "sent",
        "recent_word_count": len(recent_words),
        "recent_scrap_count": len(recent_scraps),
    }

