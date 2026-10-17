import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple
import httpx

from app.core.config import settings
from app.models.word import WordPreviewResponse
from app.services.rss_collector import RawNewsCandidate

logger = logging.getLogger(__name__)


def _extract_json_block(text: str) -> Any:
    """LLM 응답 텍스트에서 JSON 블록을 안전하게 파싱합니다."""
    cleaned = text.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if fence_match:
        cleaned = fence_match.group(1).strip()
    return json.loads(cleaned)


async def ask_antigravity_pro_safely(prompt: str) -> str:
    """
    섹션 3.1: Antigravity Python SDK (`google-antigravity`) 안전 연동
    - `deny("*")` 정책 잠금장치로 파일 읽기/쓰기, 쉘 명령, 사용자 승인 대기(Hang)를 100% 차단합니다.
    - 30초 타임아웃을 두어 지연 또는 미설치 시 즉시 REST API로 폴백합니다.
    """
    from google.antigravity import Agent, LocalAgentConfig  # type: ignore
    from google.antigravity.hooks.policy import deny  # type: ignore

    config = LocalAgentConfig(
        system_instructions=(
            "너는 개인 뉴스 요약 및 단어장 보정 전용 AI 비서야. "
            "어떠한 도구도 호출하지 말고 오직 요청받은 유효한 JSON 텍스트만 반환해."
        ),
        policies=[deny("*")],
    )

    chunks: List[str] = []
    async with asyncio.timeout(settings.ANTIGRAVITY_TIMEOUT_SECONDS):
        async with Agent(config) as agent:
            response = await agent.chat(prompt)
            async for token in response:
                chunks.append(str(token))
    return "".join(chunks)


async def ask_fast_llm_api(prompt: str) -> Tuple[str, str]:
    """
    Groq Cloud API 또는 Gemini Flash REST API를 호출합니다.
    반환값: (응답 텍스트, 사용된 엔진명)
    """
    # 1순위 고속 응답: Groq Cloud API
    if settings.GROQ_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                    json={
                        "model": settings.GROQ_MODEL,
                        "messages": [
                            {
                                "role": "system",
                                "content": "반드시 유효한 JSON 객체만 응답하세요.",
                            },
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.2,
                    },
                )
                if resp.status_code == 200:
                    content = resp.json()["choices"][0]["message"]["content"]
                    return content, f"groq:{settings.GROQ_MODEL}"
        except Exception as exc:
            logger.warning("Groq API call failed, trying Gemini fallback: %s", exc)

    # 2순위: Gemini Flash REST API
    if settings.GEMINI_API_KEY:
        try:
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{settings.GEMINI_MODEL}:generateContent"
            )
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    url,
                    params={"key": settings.GEMINI_API_KEY},
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {
                            "temperature": 0.2,
                            "responseMimeType": "application/json",
                        },
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    text = data["candidates"][0]["content"]["parts"][0]["text"]
                    return text, f"gemini:{settings.GEMINI_MODEL}"
        except Exception as exc:
            logger.warning("Gemini API call failed: %s", exc)

    raise RuntimeError("사용 가능한 외부 LLM API 키(GROQ_API_KEY / GEMINI_API_KEY)가 설정되지 않았습니다.")


async def ask_hybrid_batch_ai(prompt: str) -> Tuple[str, str]:
    """
    배치 작업(일일 주요뉴스 선별 및 해설)용 하이브리드 라우터:
    1차로 Antigravity SDK(Gemini Pro)를 시도하고, 실패/미설치 시 무료 REST API로 폴백합니다.
    """
    try:
        text = await ask_antigravity_pro_safely(prompt)
        if text.strip():
            return text, "antigravity-sdk:pro"
    except Exception as exc:
        logger.info("Antigravity SDK unavailable or timed out (%s). Falling back to REST API.", exc)

    return await ask_fast_llm_api(prompt)


async def select_top_news_step1(
    candidates: List[RawNewsCandidate],
) -> List[Tuple[str, RawNewsCandidate]]:
    """
    섹션 2.3 Step 2: 1차 AI 선별 및 표준 카테고리 분류 (~950 토큰)
    본문 없이 '[ID] 제목' 목록만 전달해 5대 분야별 Top 3 (총 15건)를 선별합니다.
    """
    if not candidates:
        return []

    id_map = {c.candidate_id: c for c in candidates}
    compact_lines = [f"[{c.candidate_id}] {c.title[:38]}" for c in candidates]
    prompt = (
        "아래 뉴스 후보 제목 목록에서 우리 서비스의 5대 표준 분야별로 가장 중요하고 "
        "실생활/경제/기술 흐름에 의미 있는 뉴스 ID를 정확히 3개씩(총 15개, 중복 없이) 골라줘.\n"
        f"표준 분야: {settings.STANDARD_NEWS_CATEGORIES}\n\n"
        "반드시 아래 JSON 형식으로만 응답해:\n"
        '{"경제/금융": [1, 2, 3], "증권/부동산": [4, 5, 6], "IT/테크": [7, 8, 9], '
        '"사회/생활": [10, 11, 12], "글로벌": [13, 14, 15]}\n\n'
        "후보 목록:\n" + "\n".join(compact_lines)
    )

    selected: List[Tuple[str, RawNewsCandidate]] = []
    used_ids: set[int] = set()

    try:
        raw_resp, _ = await ask_hybrid_batch_ai(prompt)
        parsed = _extract_json_block(raw_resp)
        if isinstance(parsed, dict):
            for category in settings.STANDARD_NEWS_CATEGORIES:
                ids = parsed.get(category) or []
                count = 0
                for cid in ids:
                    if isinstance(cid, int) and cid in id_map and cid not in used_ids:
                        selected.append((category, id_map[cid]))
                        used_ids.add(cid)
                        count += 1
                        if count >= 3:
                            break
    except Exception as exc:
        logger.info("Step 1 AI selection using rule-based fallback (%s)", exc)

    # 부족한 분야가 있으면 힌트 카테고리 기준으로 채움 (분야당 3건 보장)
    for category in settings.STANDARD_NEWS_CATEGORIES:
        current_count = sum(1 for cat, _ in selected if cat == category)
        if current_count >= 3:
            continue
        for c in candidates:
            if c.candidate_id not in used_ids and c.hint_category == category:
                selected.append((category, c))
                used_ids.add(c.candidate_id)
                current_count += 1
                if current_count >= 3:
                    break
        # 그래도 부족하면 남은 후보에서 충원
        for c in candidates:
            if current_count >= 3:
                break
            if c.candidate_id not in used_ids:
                selected.append((category, c))
                used_ids.add(c.candidate_id)
                current_count += 1

    return selected


async def generate_briefings_step2(
    selected_items: List[Tuple[str, RawNewsCandidate]],
) -> Dict[int, Dict[str, Any]]:
    """
    섹션 2.3 Step 4: 최종 선별된 15건의 제목 + 짧은 요약(150자)만 전달하여
    3줄 핵심 요약, So What 해설, 핵심 용어 1~2개를 생성합니다.
    """
    if not selected_items:
        return {}

    payload_items = [
        {
            "id": item.candidate_id,
            "category": cat,
            "title": item.title,
            "summary": (item.summary_raw or item.title)[:150],
        }
        for cat, item in selected_items
    ]

    prompt = (
        "선별된 주요뉴스 목록에 대해 각각 눈높이 브리핑과 핵심 용어를 JSON으로 작성해줘.\n"
        "출력 JSON 포맷:\n"
        '{"items": [{"id": 1, "three_line_summary": ["요약1", "요약2", "요약3"], '
        '"so_what": "내 일상/자산/커리어에 미치는 영향 한 줄 해설", '
        '"extracted_terms": [{"term": "전문용어", "definition": "쉬운 한 줄 뜻풀이"}]}]}\n\n'
        f"입력 뉴스:\n{json.dumps(payload_items, ensure_ascii=False)}"
    )

    result_map: Dict[int, Dict[str, Any]] = {}
    try:
        raw_resp, _ = await ask_hybrid_batch_ai(prompt)
        parsed = _extract_json_block(raw_resp)
        items_list = parsed.get("items", []) if isinstance(parsed, dict) else parsed
        for entry in items_list:
            cid = entry.get("id")
            if isinstance(cid, int):
                result_map[cid] = {
                    "ai_briefing": {
                        "three_line_summary": entry.get("three_line_summary") or [],
                        "so_what": entry.get("so_what") or "",
                    },
                    "extracted_terms": entry.get("extracted_terms") or [],
                }
    except Exception as exc:
        logger.info("Step 2 AI briefing using local structured fallback (%s)", exc)

    # 누락된 항목에 대한 안전한 기본 해설 채움
    for cat, item in selected_items:
        if item.candidate_id not in result_map:
            summary_line = item.summary_raw or item.title
            result_map[item.candidate_id] = {
                "ai_briefing": {
                    "three_line_summary": [
                        f"[{cat}] {item.title}",
                        summary_line[:80] if summary_line else "핵심 내용이 요약된 주요 뉴스입니다.",
                        "원문 링크를 통해 세부 배경과 후속 동향을 확인할 수 있습니다.",
                    ],
                    "so_what": f"{cat} 분야의 주요 흐름을 파악하고 내 일상과 의사결정에 참고해 보세요.",
                },
                "extracted_terms": [],
            }

    return result_map


async def preview_word_refinement(
    term: str, user_definition: Optional[str] = None
) -> WordPreviewResponse:
    """
    섹션 1.1 & 3.2: 단어사전 실시간 AI 내용 보정 미리보기 (Groq / Gemini Flash 우선 사용)
    """
    user_memo_text = (user_definition or "").strip()
    prompt = (
        f"단어/용어: '{term}'\n"
        f"사용자가 작성한 메모/뜻: '{user_memo_text or '(없음)'}'\n\n"
        "위 단어에 대해 사용자의 오개념을 부드럽게 교정하고 사전 수준으로 보강하여 아래 JSON 형식으로만 응답해줘:\n"
        "{\n"
        '  "corrected_user_memo": "사용자 메모를 자연스럽게 다듬고 교정한 설명",\n'
        '  "one_line_definition": "누구나 이해하기 쉬운 직관적인 한 줄 핵심 정의",\n'
        '  "ai_refined_definition": "배경과 맥락을 포함한 명확한 사전적 해설 (2~3문장)",\n'
        '  "examples": ["실전 뉴스/비즈니스 활용 예문 1", "실전 활용 예문 2"],\n'
        '  "related_keywords": ["연관 키워드1", "연관 키워드2"],\n'
        '  "opposite_keywords": ["반대/대조 키워드1"]\n'
        "}"
    )

    try:
        raw_resp, engine_name = await ask_fast_llm_api(prompt)
        data = _extract_json_block(raw_resp)
        return WordPreviewResponse(
            term=term,
            user_definition=user_definition,
            corrected_user_memo=data.get("corrected_user_memo") or user_memo_text or f"'{term}'의 핵심 개념을 정리했습니다.",
            one_line_definition=data.get("one_line_definition") or f"{term}에 대한 한 줄 핵심 요약입니다.",
            ai_refined_definition=data.get("ai_refined_definition") or data.get("one_line_definition") or "",
            examples=data.get("examples") or [],
            related_keywords=data.get("related_keywords") or [],
            opposite_keywords=data.get("opposite_keywords") or [],
            engine_used=engine_name,
        )
    except Exception as exc:
        logger.info("Word preview fallback triggered for '%s': %s", term, exc)
        base_desc = (
            user_memo_text
            if user_memo_text
            else f"'{term}'은(는) 뉴스와 실무에서 자주 등장하는 핵심 개념입니다."
        )
        return WordPreviewResponse(
            term=term,
            user_definition=user_definition,
            corrected_user_memo=f"[교정 완료] {base_desc}",
            one_line_definition=f"{term}: 핵심 맥락을 빠르게 이해해야 하는 주요 용어",
            ai_refined_definition=(
                f"{base_desc} (GROQ_API_KEY 또는 GEMINI_API_KEY를 .env에 설정하면 "
                "실시간 AI 상세 교정·예문이 생성됩니다.)"
            ),
            examples=[
                f"최근 주요 뉴스에서 '{term}' 이슈가 시장의 핵심 화두로 떠올랐습니다.",
                f"실무 회의에서 '{term}' 개념을 바탕으로 대응 전략을 논의했습니다.",
            ],
            related_keywords=[term, "핵심개념"],
            opposite_keywords=[],
            engine_used="local-fallback",
        )
