# Backend & AI Pipeline Rules

## 1. 한국어 단어·키워드 정규화 규칙 (`app/services/ai_engine.py`)
- 모든 뉴스 핵심 용어 추출(`generate_briefings_step2`, `_extract_fallback_terms`)과 단어 등록(`routers/words.py`, `routers/news.py`)은 `normalize_korean_term()`을 통과해야 합니다.
- 조사(`은/는/이/가/을/를/의/에/로/도/만/과/와`, `에서/으로/까지/부터/에는` 등)가 붙은 어절이 그대로 저장되지 않도록 검증합니다.
- 동시에 `전문가`, `분양가`, `상한가`, `만족도`, `신뢰도`, `물가`, `제도` 등 끝 글자가 조사와 동일한 명사 원형은 훼손하지 않도록 `_PROTECTED_NOUNS` 및 어간 보호 규칙을 유지합니다.

## 2. 날짜 지정 뉴스 파이프라인 (`app/routers/news.py`, `app/services/scheduler.py`)
- `POST /api/news/collect` 엔드포인트는 `target_date: Optional[date]` 쿼리 파라미터를 수용하여 `run_daily_news_pipeline(target_date=effective_date)`로 전달해야 합니다.
- `GET /api/news/daily`는 `target_date`가 지정된 경우 해당 날짜의 뉴스만 필터링하여 반환하며, 임의로 다른 날짜의 뉴스로 대체하지 않습니다.

## 3. 멀티 유저 격리 및 TTL 보호
- 모든 단어장/스크랩/설정 쿼리는 `current_user.id` 조건을 포함해야 합니다.
- 자정 TTL 삭제(`cleanup_expired_unscrapped_news`)는 `user_news_scrap`에 단 1건이라도 존재하는 뉴스는 절대 삭제하지 않습니다.
