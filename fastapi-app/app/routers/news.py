from datetime import date, datetime
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.core.auth import get_current_user
from app.core.database import get_session
from app.models.news import (
    DailyNews,
    DailyNewsItemResponse,
    MatchedWordHighlight,
    NewsScrapRequest,
    NewsToWordRequest,
    UserNewsScrap,
)
from app.models.user import AppUser
from app.models.word import WordCategory, WordEntry
from app.services.ai_engine import preview_word_refinement
from app.services.scheduler import run_daily_news_pipeline

router = APIRouter(prefix="/api/news", tags=["Daily News & Synergy (주요뉴스 & 연동)"])


def _match_user_vocabulary_in_news(
    news: DailyNews,
    user_words: List[WordEntry],
    category_map: Dict[int, str],
) -> List[MatchedWordHighlight]:
    """
    섹션 1.3 시너지 기능 2:
    당일 주요뉴스의 제목·요약·해설에 내가 단어사전에 등록해 둔 단어가 등장하면
    형광펜 하이라이트 및 툴팁 노출을 위한 매칭 목록을 반환합니다.
    """
    briefing = news.ai_briefing or {}
    summary_lines = " ".join(briefing.get("three_line_summary") or [])
    so_what = briefing.get("so_what") or ""
    haystack = f"{news.title} {news.summary_raw or ''} {summary_lines} {so_what}".lower()

    matched: List[MatchedWordHighlight] = []
    for w in user_words:
        term_clean = (w.term or "").strip()
        if len(term_clean) >= 2 and term_clean.lower() in haystack and w.id is not None:
            matched.append(
                MatchedWordHighlight(
                    word_id=w.id,
                    term=term_clean,
                    definition=(
                        w.ai_refined_definition
                        or w.user_definition
                        or "내 단어사전에 등록된 용어"
                    ),
                    category_name=category_map.get(w.category_id)
                    if w.category_id
                    else None,
                )
            )
    return matched


@router.get("/daily", response_model=List[DailyNewsItemResponse])
def get_daily_news(
    target_date: Optional[date] = Query(
        default=None, description="조회할 브리핑 날짜 (미지정 시 가장 최근 브리핑 일자)"
    ),
    category: Optional[str] = Query(default=None, description="5대 표준 분야 필터"),
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> List[DailyNewsItemResponse]:
    """
    날짜별·분야별 주요 뉴스(5분야×3건)를 조회합니다.
    현재 로그인 유저의 스크랩 여부(is_scrapped)와 내 단어장 형광펜 매칭(matched_words)이 함께 포함됩니다.
    """
    if target_date is None:
        latest_news = session.exec(
            select(DailyNews).order_by(DailyNews.briefing_date.desc())
        ).first()
        target_date = (
            latest_news.briefing_date if latest_news else datetime.now().date()
        )

    stmt = select(DailyNews).where(DailyNews.briefing_date == target_date)
    if category:
        stmt = stmt.where(DailyNews.category == category)
    stmt = stmt.order_by(DailyNews.category, DailyNews.id)
    news_list = list(session.exec(stmt).all())

    # 유저 스크랩 맵 조회
    scraps = session.exec(
        select(UserNewsScrap).where(UserNewsScrap.user_id == current_user.id)
    ).all()
    scrap_map = {s.news_id: s for s in scraps}

    # 유저 단어사전 목록 및 카테고리명 조회 (형광펜 매칭용)
    user_words = list(
        session.exec(
            select(WordEntry).where(WordEntry.user_id == current_user.id)
        ).all()
    )
    user_cats = session.exec(
        select(WordCategory).where(WordCategory.user_id == current_user.id)
    ).all()
    cat_name_map = {c.id: c.name for c in user_cats if c.id is not None}

    response_items: List[DailyNewsItemResponse] = []
    for n in news_list:
        if n.id is None:
            continue
        scrap = scrap_map.get(n.id)
        response_items.append(
            DailyNewsItemResponse(
                id=n.id,
                briefing_date=n.briefing_date,
                category=n.category,
                press_name=n.press_name,
                title=n.title,
                original_url=n.original_url,
                thumbnail_url=n.thumbnail_url,
                summary_raw=n.summary_raw,
                ai_briefing=n.ai_briefing or {},
                extracted_terms=n.extracted_terms or [],
                is_scrapped=scrap is not None,
                user_memo=scrap.user_memo if scrap else None,
                matched_words=_match_user_vocabulary_in_news(
                    n, user_words, cat_name_map
                ),
                created_at=n.created_at,
            )
        )

    return response_items


@router.post("/collect", response_model=Dict[str, object])
async def trigger_news_collection(
    current_user: AppUser = Depends(get_current_user),
) -> Dict[str, object]:
    """즉시 공식 RSS 뉴스 수집 및 2-Step AI 눈높이 브리핑 생성을 수동 트리거합니다."""
    _ = current_user
    saved_items = await run_daily_news_pipeline()
    return {
        "status": "completed",
        "collected_count": len(saved_items),
        "briefing_date": str(datetime.now().date()),
    }


@router.post("/{news_id}/scrap", response_model=Dict[str, object])
def toggle_news_scrap(
    news_id: int,
    payload: Optional[NewsScrapRequest] = None,
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> Dict[str, object]:
    """
    특정 뉴스를 내 영구 보관함(user_news_scrap)에 스크랩 토글하거나 한 줄 메모를 업데이트합니다.
    단 1명의 유저라도 스크랩한 뉴스는 자정 TTL 스케줄러에서 삭제되지 않고 영구 보존됩니다.
    """
    news = session.get(DailyNews, news_id)
    if not news:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 뉴스를 찾을 수 없습니다.",
        )

    existing = session.exec(
        select(UserNewsScrap).where(
            UserNewsScrap.user_id == current_user.id,
            UserNewsScrap.news_id == news_id,
        )
    ).first()

    memo = payload.user_memo if payload else None

    if existing:
        if memo is not None and memo != existing.user_memo:
            existing.user_memo = memo
            session.add(existing)
            session.commit()
            return {"news_id": news_id, "is_scrapped": True, "user_memo": existing.user_memo}
        session.delete(existing)
        session.commit()
        return {"news_id": news_id, "is_scrapped": False, "user_memo": None}

    new_scrap = UserNewsScrap(
        user_id=current_user.id,
        news_id=news_id,
        user_memo=memo,
    )
    session.add(new_scrap)
    session.commit()
    return {"news_id": news_id, "is_scrapped": True, "user_memo": new_scrap.user_memo}


@router.get("/scraps", response_model=List[DailyNewsItemResponse])
def list_scrapped_news(
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> List[DailyNewsItemResponse]:
    """내가 영구 보관함(스크랩)에 저장한 뉴스 목록을 조회합니다."""
    rows = session.exec(
        select(UserNewsScrap, DailyNews)
        .join(DailyNews, UserNewsScrap.news_id == DailyNews.id)
        .where(UserNewsScrap.user_id == current_user.id)
        .order_by(UserNewsScrap.created_at.desc())
    ).all()

    return [
        DailyNewsItemResponse(
            id=news.id,
            briefing_date=news.briefing_date,
            category=news.category,
            press_name=news.press_name,
            title=news.title,
            original_url=news.original_url,
            thumbnail_url=news.thumbnail_url,
            summary_raw=news.summary_raw,
            ai_briefing=news.ai_briefing or {},
            extracted_terms=news.extracted_terms or [],
            is_scrapped=True,
            user_memo=scrap.user_memo,
            matched_words=[],
            created_at=news.created_at,
        )
        for scrap, news in rows
        if news.id is not None
    ]


@router.post(
    "/{news_id}/to-word",
    response_model=WordEntry,
    status_code=status.HTTP_201_CREATED,
)
async def add_news_term_to_vocabulary(
    news_id: int,
    payload: NewsToWordRequest,
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> WordEntry:
    """
    섹션 1.3 & 5.1: 뉴스 브리핑 내 핵심 용어를 내 단어사전으로 원클릭 등록합니다.
    추후 뉴스가 스크랩되지 않아 TTL 삭제되더라도 출처가 유실되지 않도록
    `source_news_title`과 `source_news_url`을 스냅샷으로 함께 보관합니다.
    """
    news = session.get(DailyNews, news_id)
    if not news:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="출처 뉴스를 찾을 수 없습니다.",
        )

    target_category_id = payload.category_id
    if target_category_id is None:
        first_cat = session.exec(
            select(WordCategory)
            .where(WordCategory.user_id == current_user.id)
            .order_by(WordCategory.sort_order, WordCategory.id)
        ).first()
        if first_cat:
            target_category_id = first_cat.id

    ai_preview = await preview_word_refinement(
        term=payload.term.strip(),
        user_definition=payload.user_memo or payload.definition,
    )

    word_entry = WordEntry(
        user_id=current_user.id,
        category_id=target_category_id,
        source_news_id=news.id,
        source_news_title=news.title,
        source_news_url=news.original_url,
        term=payload.term.strip(),
        user_definition=payload.user_memo or payload.definition,
        ai_refined_definition=ai_preview.ai_refined_definition,
        ai_supplement={
            "one_line_definition": ai_preview.one_line_definition,
            "corrected_user_memo": ai_preview.corrected_user_memo,
            "examples": ai_preview.examples,
            "related_keywords": ai_preview.related_keywords,
            "opposite_keywords": ai_preview.opposite_keywords,
        },
    )
    session.add(word_entry)
    session.commit()
    session.refresh(word_entry)
    return word_entry
