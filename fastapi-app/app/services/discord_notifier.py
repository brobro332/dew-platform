from datetime import date
import logging
from typing import Any, Dict, List
import httpx

from app.core.config import settings
from app.models.news import DailyNews

logger = logging.getLogger(__name__)

# 분야별 디스코드 Embed 색상 및 아이콘
CATEGORY_STYLES: Dict[str, Dict[str, Any]] = {
    "경제/금융": {"emoji": "📈", "color": 3447003},
    "증권/부동산": {"emoji": "💰", "color": 15844367},
    "IT/테크": {"emoji": "💻", "color": 10181046},
    "사회/생활": {"emoji": "🏛️", "color": 3066993},
    "글로벌": {"emoji": "🌍", "color": 15105570},
}

NUMBER_BADGES = ["1️⃣", "2️⃣", "3️⃣"]


def build_daily_briefing_payload(
    briefing_date: date,
    news_items: List[DailyNews],
    active_categories: List[str],
) -> Dict[str, Any]:
    """
    섹션 6: 디스코드 웹훅의 1회 최대 10개 Embed 제한을 준수하여,
    구독 분야별로 카드(Embed) 1장씩(최대 5장) 구성합니다.
    """
    embeds: List[Dict[str, Any]] = []
    target_categories = active_categories or settings.STANDARD_NEWS_CATEGORIES

    for category in target_categories[:5]:
        cat_items = [n for n in news_items if n.category == category][:3]
        if not cat_items:
            continue

        style = CATEGORY_STYLES.get(category, {"emoji": "📰", "color": 3447003})
        fields: List[Dict[str, Any]] = []

        for idx, item in enumerate(cat_items):
            badge = NUMBER_BADGES[idx] if idx < len(NUMBER_BADGES) else f"{idx + 1}."
            briefing = item.ai_briefing or {}
            summaries = briefing.get("three_line_summary") or []
            first_summary = summaries[0] if summaries else (item.summary_raw or item.title)
            so_what = briefing.get("so_what") or "오늘의 주요 흐름을 확인해 보세요."

            terms_line = ""
            if item.extracted_terms:
                first_term = item.extracted_terms[0]
                t_name = first_term.get("term", "")
                t_def = first_term.get("definition", "")
                if t_name:
                    terms_line = f"\n• 📕 **핵심단어**: `{t_name}` ({t_def})"

            field_value = (
                f"• {first_summary}\n"
                f"• 💡 **Point**: {so_what}"
                f"{terms_line}\n"
                f"• 🔗 [원문 보기]({item.original_url})"
            )

            fields.append(
                {
                    "name": f"{badge} {item.title[:90]}",
                    "value": field_value[:1020],
                    "inline": False,
                }
            )

        embeds.append(
            {
                "title": f"{style['emoji']} [{category}] 오늘의 핵심 뉴스 Top {len(cat_items)}",
                "color": style["color"],
                "fields": fields,
                "footer": {
                    "text": "Dew Platform 대시보드에서 마음에 드는 뉴스를 [저장]하거나 단어를 [단어사전]에 추가해 보세요!"
                },
            }
        )

    date_str = f"{briefing_date.month}월 {briefing_date.day}일"
    return {
        "username": "Dew AI 케어 비서",
        "content": f"☀️ **{date_str} 오늘의 주요뉴스 눈높이 브리핑 (총 {sum(len(e['fields']) for e in embeds)}건)**",
        "embeds": embeds,
    }


async def send_discord_webhook(webhook_url: str, payload: Dict[str, Any]) -> bool:
    """지정된 디스코드 웹훅 URL로 Rich Embed 페이로드를 발송합니다."""
    if not webhook_url or not webhook_url.strip():
        return False

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(webhook_url.strip(), json=payload)
        if resp.status_code in (200, 204):
            return True
        logger.warning(
            "Discord webhook returned status %s: %s", resp.status_code, resp.text
        )
        return False
