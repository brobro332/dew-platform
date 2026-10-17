from typing import List, Optional
from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


DEFAULT_CATEGORIES = ["경제/금융", "증권/부동산", "IT/테크", "사회/생활", "글로벌"]


class CareSetting(SQLModel, table=True):
    """유저별 디스코드 웹훅, 관심 뉴스 분야, 개인 알림 시간 설정 엔티티."""

    __tablename__ = "care_setting"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="app_user.id", unique=True, index=True)
    discord_webhook_url: Optional[str] = Field(default=None, max_length=1000)
    active_categories: List[str] = Field(
        default_factory=lambda: list(DEFAULT_CATEGORIES),
        sa_column=Column(JSON, nullable=False),
    )
    daily_cron_time: str = Field(default="07:30", max_length=10)
    weekly_remind_enabled: bool = Field(default=True)
    is_active: bool = Field(default=True)


class CareSettingUpdateRequest(SQLModel):
    discord_webhook_url: Optional[str] = None
    active_categories: Optional[List[str]] = None
    daily_cron_time: Optional[str] = None
    weekly_remind_enabled: Optional[bool] = None
    is_active: Optional[bool] = None
