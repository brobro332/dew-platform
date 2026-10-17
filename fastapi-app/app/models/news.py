from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import Column, JSON, UniqueConstraint
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def today_date() -> date:
    return datetime.now().date()


class DailyNews(SQLModel, table=True):
    """일일 5대 표준 분야 주요뉴스 & AI 눈높이 브리핑 엔티티 (전 유저 공유)."""

    __tablename__ = "daily_news"

    id: Optional[int] = Field(default=None, primary_key=True)
    briefing_date: date = Field(default_factory=today_date, index=True)
    category: str = Field(index=True, max_length=50)
    press_name: str = Field(max_length=100)
    title: str = Field(max_length=500)
    original_url: str = Field(unique=True, max_length=1000)
    thumbnail_url: Optional[str] = Field(default=None, max_length=1000)
    summary_raw: Optional[str] = Field(default=None)
    ai_briefing: Dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False)
    )
    extracted_terms: List[Dict[str, Any]] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    created_at: datetime = Field(default_factory=utc_now)


class UserNewsScrap(SQLModel, table=True):
    """유저별 영구 스크랩 뉴스 보관함 및 한 줄 메모 엔티티."""

    __tablename__ = "user_news_scrap"
    __table_args__ = (
        UniqueConstraint("user_id", "news_id", name="uq_user_news_scrap"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="app_user.id", index=True)
    news_id: int = Field(foreign_key="daily_news.id", index=True)
    user_memo: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)


# ==========================================
# Request / Response DTOs
# ==========================================


class MatchedWordHighlight(SQLModel):
    """뉴스 본문/제목에 등장한 내 단어사전 형광펜 매칭 정보."""

    word_id: int
    term: str
    definition: str
    category_name: Optional[str] = None


class DailyNewsItemResponse(SQLModel):
    id: int
    briefing_date: date
    category: str
    press_name: str
    title: str
    original_url: str
    thumbnail_url: Optional[str] = None
    summary_raw: Optional[str] = None
    ai_briefing: Dict[str, Any] = Field(default_factory=dict)
    extracted_terms: List[Dict[str, Any]] = Field(default_factory=list)
    is_scrapped: bool = False
    user_memo: Optional[str] = None
    matched_words: List[MatchedWordHighlight] = Field(default_factory=list)
    created_at: datetime


class NewsScrapRequest(SQLModel):
    user_memo: Optional[str] = None


class NewsToWordRequest(SQLModel):
    term: str
    definition: Optional[str] = None
    category_id: Optional[int] = None
    user_memo: Optional[str] = None
