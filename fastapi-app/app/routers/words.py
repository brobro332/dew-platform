from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.auth import get_current_user
from app.core.database import get_session
from app.models.user import AppUser
from app.models.word import (
    CategoryCreateRequest,
    CategoryResponse,
    WordCategory,
    WordCreateRequest,
    WordEntry,
    WordPreviewRequest,
    WordPreviewResponse,
    WordUpdateRequest,
)
from app.services.ai_engine import preview_word_refinement

router = APIRouter(prefix="/api", tags=["Vocabulary Vault (나만의 단어사전)"])


@router.get("/categories", response_model=List[CategoryResponse])
def list_categories(
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> List[CategoryResponse]:
    """내 단어사전 카테고리 목록과 각 카테고리별 등록 단어 수를 조회합니다."""
    categories = session.exec(
        select(WordCategory)
        .where(WordCategory.user_id == current_user.id)
        .order_by(WordCategory.sort_order, WordCategory.id)
    ).all()

    counts_rows = session.exec(
        select(WordEntry.category_id, func.count(WordEntry.id))
        .where(WordEntry.user_id == current_user.id)
        .group_by(WordEntry.category_id)
    ).all()
    count_map = {cat_id: cnt for cat_id, cnt in counts_rows if cat_id is not None}

    return [
        CategoryResponse(
            id=cat.id,
            name=cat.name,
            color_code=cat.color_code,
            sort_order=cat.sort_order,
            word_count=count_map.get(cat.id, 0),
            created_at=cat.created_at,
        )
        for cat in categories
        if cat.id is not None
    ]


@router.post(
    "/categories",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    payload: CategoryCreateRequest,
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> CategoryResponse:
    """새 사용자 정의 단어사전 카테고리를 생성합니다."""
    sort_order = payload.sort_order
    if sort_order is None:
        max_order = session.exec(
            select(func.max(WordCategory.sort_order)).where(
                WordCategory.user_id == current_user.id
            )
        ).one()
        sort_order = (max_order or 0) + 1

    category = WordCategory(
        user_id=current_user.id,
        name=payload.name.strip(),
        color_code=payload.color_code,
        sort_order=sort_order,
    )
    session.add(category)
    session.commit()
    session.refresh(category)

    return CategoryResponse(
        id=category.id,
        name=category.name,
        color_code=category.color_code,
        sort_order=category.sort_order,
        word_count=0,
        created_at=category.created_at,
    )


@router.delete(
    "/categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_category(
    category_id: int,
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> None:
    """단어사전 카테고리를 삭제합니다 (소속 단어들의 category_id는 NULL로 안전하게 해제됩니다)."""
    category = session.exec(
        select(WordCategory).where(
            WordCategory.id == category_id,
            WordCategory.user_id == current_user.id,
        )
    ).first()
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 카테고리를 찾을 수 없습니다.",
        )

    # 소속 단어의 category_id를 NULL로 해제 후 카테고리 삭제
    words_in_cat = session.exec(
        select(WordEntry).where(
            WordEntry.user_id == current_user.id,
            WordEntry.category_id == category_id,
        )
    ).all()
    for w in words_in_cat:
        w.category_id = None
        session.add(w)

    session.delete(category)
    session.commit()



@router.post("/words/preview-ai", response_model=WordPreviewResponse)
async def preview_word_with_ai(
    payload: WordPreviewRequest,
    current_user: AppUser = Depends(get_current_user),
) -> WordPreviewResponse:
    """
    단어 등록 전 AI 내용 보정 미리보기 (Before / After 비교용):
    내 메모 교정 + 한 줄 핵심 정의 + 실전 활용 예문 2가지 + 연관/반대 키워드를 생성합니다.
    """
    _ = current_user
    term = payload.term.strip()
    if not term:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="단어명(term)을 입력해 주세요.",
        )
    return await preview_word_refinement(
        term=term, user_definition=payload.user_definition
    )


@router.post("/words", response_model=WordEntry, status_code=status.HTTP_201_CREATED)
def create_word(
    payload: WordCreateRequest,
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> WordEntry:
    """사용자 메모 및 AI 보정본을 포함하여 단어를 단어사전에 최종 저장합니다."""
    if payload.category_id is not None:
        cat = session.exec(
            select(WordCategory).where(
                WordCategory.id == payload.category_id,
                WordCategory.user_id == current_user.id,
            )
        ).first()
        if not cat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="지정한 카테고리를 찾을 수 없습니다.",
            )

    word = WordEntry(
        user_id=current_user.id,
        category_id=payload.category_id,
        source_news_id=payload.source_news_id,
        source_news_title=payload.source_news_title,
        source_news_url=payload.source_news_url,
        term=payload.term.strip(),
        user_definition=payload.user_definition,
        ai_refined_definition=payload.ai_refined_definition,
        ai_supplement=payload.ai_supplement or {},
    )
    session.add(word)
    session.commit()
    session.refresh(word)
    return word


@router.get("/words", response_model=List[WordEntry])
def list_words(
    category_id: Optional[int] = Query(default=None),
    q: Optional[str] = Query(default=None, description="단어명 또는 뜻 검색어"),
    is_memorized: Optional[bool] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> List[WordEntry]:
    """내 카테고리별·검색어별 단어 목록을 최신순으로 조회합니다."""
    stmt = select(WordEntry).where(WordEntry.user_id == current_user.id)

    if category_id is not None:
        stmt = stmt.where(WordEntry.category_id == category_id)
    if is_memorized is not None:
        stmt = stmt.where(WordEntry.is_memorized == is_memorized)
    if q and q.strip():
        keyword = f"%{q.strip()}%"
        stmt = stmt.where(
            (WordEntry.term.ilike(keyword))
            | (WordEntry.user_definition.ilike(keyword))
            | (WordEntry.ai_refined_definition.ilike(keyword))
        )

    stmt = stmt.order_by(WordEntry.created_at.desc())
    return list(session.exec(stmt).all())


@router.patch("/words/{word_id}", response_model=WordEntry)
def update_word(
    word_id: int,
    payload: WordUpdateRequest,
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> WordEntry:
    """단어 내용, 카테고리 또는 숙지 완료(is_memorized) 여부를 수정합니다."""
    word = session.exec(
        select(WordEntry).where(
            WordEntry.id == word_id, WordEntry.user_id == current_user.id
        )
    ).first()
    if not word:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 단어를 찾을 수 없습니다.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(word, key, value)
    word.updated_at = datetime.now(timezone.utc)

    session.add(word)
    session.commit()
    session.refresh(word)
    return word


@router.delete("/words/{word_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_word(
    word_id: int,
    session: Session = Depends(get_session),
    current_user: AppUser = Depends(get_current_user),
) -> None:
    """단어사전에서 특정 단어를 삭제합니다."""
    word = session.exec(
        select(WordEntry).where(
            WordEntry.id == word_id, WordEntry.user_id == current_user.id
        )
    ).first()
    if not word:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 단어를 찾을 수 없습니다.",
        )
    session.delete(word)
    session.commit()
