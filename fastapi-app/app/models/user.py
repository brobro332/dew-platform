from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AppUser(SQLModel, table=True):
    """Cloudflare Zero Trust 인증 이메일 기반 멀티 유저 엔티티."""

    __tablename__ = "app_user"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=255)
    nickname: str = Field(max_length=100)
    created_at: datetime = Field(default_factory=utc_now)
    last_login_at: datetime = Field(default_factory=utc_now)


class UserProfileResponse(SQLModel):
    """GET /api/me 응답 DTO."""

    id: int
    email: str
    nickname: str
    created_at: datetime
    last_login_at: datetime
    word_count: int = 0
    scrap_count: int = 0


class UserProfileUpdateRequest(SQLModel):
    """PATCH /api/me 닉네임 변경 요청 DTO."""

    nickname: str

