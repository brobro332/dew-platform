from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class WordCategory(SQLModel, table=True):
    """유저별 사용자 정의 단어사전 카테고리 엔티티."""

    __tablename__ = "word_category"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="app_user.id", index=True)
    name: str = Field(max_length=100)
    color_code: str = Field(default="#3B82F6", max_length=30)
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=utc_now)


class WordEntry(SQLModel, table=True):
    """나만의 단어사전 항목 엔티티 (뉴스 출처 스냅샷 포함)."""

    __tablename__ = "word_entry"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="app_user.id", index=True)
    category_id: Optional[int] = Field(
        default=None, foreign_key="word_category.id", index=True
    )
    source_news_id: Optional[int] = Field(
        default=None, foreign_key="daily_news.id", nullable=True
    )
    source_news_title: Optional[str] = Field(default=None, max_length=500)
    source_news_url: Optional[str] = Field(default=None, max_length=1000)
    term: str = Field(index=True, max_length=200)
    user_definition: Optional[str] = Field(default=None)
    ai_refined_definition: Optional[str] = Field(default=None)
    ai_supplement: Dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False)
    )
    is_memorized: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


# ==========================================
# Request / Response DTOs
# ==========================================


class CategoryCreateRequest(SQLModel):
    name: str
    color_code: str = "#3B82F6"
    sort_order: Optional[int] = None


class CategoryResponse(SQLModel):
    id: int
    name: str
    color_code: str
    sort_order: int
    word_count: int = 0
    created_at: datetime


class WordPreviewRequest(SQLModel):
    term: str
    user_definition: Optional[str] = None


class WordPreviewResponse(SQLModel):
    term: str
    user_definition: Optional[str] = None
    corrected_user_memo: str
    one_line_definition: str
    ai_refined_definition: str
    examples: List[str] = Field(default_factory=list)
    related_keywords: List[str] = Field(default_factory=list)
    opposite_keywords: List[str] = Field(default_factory=list)
    engine_used: str = "fallback"


class WordCreateRequest(SQLModel):
    category_id: Optional[int] = None
    term: str
    user_definition: Optional[str] = None
    ai_refined_definition: Optional[str] = None
    ai_supplement: Dict[str, Any] = Field(default_factory=dict)
    source_news_id: Optional[int] = None
    source_news_title: Optional[str] = None
    source_news_url: Optional[str] = None


class WordUpdateRequest(SQLModel):
    category_id: Optional[int] = None
    term: Optional[str] = None
    user_definition: Optional[str] = None
    ai_refined_definition: Optional[str] = None
    ai_supplement: Optional[Dict[str, Any]] = None
    is_memorized: Optional[bool] = None
