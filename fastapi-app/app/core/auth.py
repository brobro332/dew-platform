from datetime import datetime, timezone
from typing import Optional
from fastapi import Depends, Header, HTTPException, status
from sqlmodel import Session, select

from app.core.config import settings
from app.core.database import get_session
from app.models.user import AppUser
from app.models.word import WordCategory
from app.models.setting import CareSetting


# 최초 가입(JIT Provisioning) 시 자동 생성할 기본 단어장 카테고리
DEFAULT_WORD_CATEGORIES = [
    {"name": "경제/금융", "color_code": "#2563EB", "sort_order": 1},
    {"name": "IT/개발", "color_code": "#7C3AED", "sort_order": 2},
    {"name": "시사/교양", "color_code": "#059669", "sort_order": 3},
    {"name": "비즈니스 어휘", "color_code": "#D97706", "sort_order": 4},
]


def get_current_user(
    session: Session = Depends(get_session),
    cf_access_email: Optional[str] = Header(
        default=None,
        alias="Cf-Access-Authenticated-User-Email",
        description="Cloudflare Zero Trust Access가 주입하는 인증 이메일 헤더",
    ),
) -> AppUser:
    """
    Cloudflare Access 헤더(`Cf-Access-Authenticated-User-Email`)를 읽어 현재 유저를 식별하고,
    최초 접속자인 경우 자동으로 계정 + 기본 단어장 카테고리 + 알림 설정을 생성(JIT Provisioning)합니다.
    로컬 개발 환경에서 헤더가 없으면 `DEV_DEFAULT_EMAIL`로 폴백합니다.
    """
    email = (cf_access_email or settings.DEV_DEFAULT_EMAIL or "").strip().lower()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증된 이메일 헤더(Cf-Access-Authenticated-User-Email)가 없습니다.",
        )

    statement = select(AppUser).where(AppUser.email == email)
    user = session.exec(statement).first()
    now = datetime.now(timezone.utc)

    if user is None:
        # Just-In-Time (JIT) Provisioning: 최초 접속 유저 자동 생성
        default_nickname = (
            settings.DEV_DEFAULT_NICKNAME
            if email == settings.DEV_DEFAULT_EMAIL.lower()
            else email.split("@")[0]
        )
        user = AppUser(
            email=email,
            nickname=default_nickname,
            created_at=now,
            last_login_at=now,
        )
        session.add(user)
        session.flush()  # user.id 확보

        # 1. 기본 단어장 카테고리 4종 초기화
        for cat in DEFAULT_WORD_CATEGORIES:
            session.add(
                WordCategory(
                    user_id=user.id,
                    name=cat["name"],
                    color_code=cat["color_code"],
                    sort_order=cat["sort_order"],
                )
            )

        # 2. 개인 케어 알림 설정 초기화
        session.add(
            CareSetting(
                user_id=user.id,
                active_categories=list(settings.STANDARD_NEWS_CATEGORIES),
                daily_cron_time="07:30",
                weekly_remind_enabled=True,
                is_active=True,
            )
        )

        session.commit()
        session.refresh(user)
    else:
        user.last_login_at = now
        session.add(user)
        session.commit()
        session.refresh(user)

    return user
