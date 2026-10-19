import asyncio
import html
import logging
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import feedparser
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class RawNewsCandidate:
    """RSS에서 1차 수집된 후보 기사 데이터 구조 (인메모리 처리용)."""

    candidate_id: int
    press_name: str
    hint_category: str
    title: str
    original_url: str
    thumbnail_url: Optional[str] = None
    summary_raw: str = ""


# 섹션 2.1 국내 주요 언론사 및 포털 공식 RSS 엔드포인트 전체 매핑표
OFFICIAL_RSS_FEEDS: List[Dict[str, str]] = [
    # 1. 매일경제
    {
        "press": "매일경제",
        "hint_category": "경제/금융",
        "url": "https://www.mk.co.kr/rss/30000001/",
    },
    {
        "press": "매일경제",
        "hint_category": "경제/금융",
        "url": "https://www.mk.co.kr/rss/30100041/",
    },
    {
        "press": "매일경제",
        "hint_category": "증권/부동산",
        "url": "https://www.mk.co.kr/rss/50200011/",
    },
    {
        "press": "매일경제",
        "hint_category": "증권/부동산",
        "url": "https://www.mk.co.kr/rss/50300009/",
    },
    {
        "press": "매일경제",
        "hint_category": "IT/테크",
        "url": "https://www.mk.co.kr/rss/50100032/",
    },
    # 2. SBS 뉴스
    {
        "press": "SBS 뉴스",
        "hint_category": "사회/생활",
        "url": "https://news.sbs.co.kr/news/headlineRssFeed.do?plink=RSSREADER",
    },
    {
        "press": "SBS 뉴스",
        "hint_category": "경제/금융",
        "url": "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=02&plink=RSSREADER",
    },
    {
        "press": "SBS 뉴스",
        "hint_category": "사회/생활",
        "url": "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=03&plink=RSSREADER",
    },
    {
        "press": "SBS 뉴스",
        "hint_category": "글로벌",
        "url": "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=07&plink=RSSREADER",
    },
    # 3. 연합뉴스TV
    {
        "press": "연합뉴스TV",
        "hint_category": "사회/생활",
        "url": "https://www.yonhapnewstv.co.kr/browse/feed/",
    },
    {
        "press": "연합뉴스TV",
        "hint_category": "경제/금융",
        "url": "http://www.yonhapnewstv.co.kr/category/news/economy/feed/",
    },
    {
        "press": "연합뉴스TV",
        "hint_category": "사회/생활",
        "url": "http://www.yonhapnewstv.co.kr/category/news/society/feed/",
    },
    # 4. 한국경제 (description 미제공 -> 선별 시 네이버 뉴스 검색 API로 보강)
    {
        "press": "한국경제",
        "hint_category": "경제/금융",
        "url": "https://www.hankyung.com/feed/economy",
    },
    {
        "press": "한국경제",
        "hint_category": "IT/테크",
        "url": "https://www.hankyung.com/feed/it",
    },
    {
        "press": "한국경제",
        "hint_category": "증권/부동산",
        "url": "https://www.hankyung.com/feed/finance",
    },
    {
        "press": "한국경제",
        "hint_category": "글로벌",
        "url": "https://www.hankyung.com/feed/international",
    },
    # 5. 구글 뉴스 (KR) — IT/과학 및 종합 이슈 보조 수집
    {
        "press": "구글뉴스(KR)",
        "hint_category": "IT/테크",
        "url": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB?hl=ko&gl=KR&ceid=KR:ko",
    },
]

TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")


def clean_html_text(raw_text: Optional[str], max_len: int = 200) -> str:
    """HTML 태그 및 엔티티를 제거하고 지정 길이로 정제합니다."""
    if not raw_text:
        return ""
    unescaped = html.unescape(raw_text)
    without_tags = TAG_RE.sub(" ", unescaped)
    normalized = WHITESPACE_RE.sub(" ", without_tags).strip()
    return normalized[:max_len]


def _extract_thumbnail(entry: dict) -> Optional[str]:
    """RSS entry 내부의 media_content 또는 enclosure에서 썸네일 URL을 추출합니다."""
    media_contents = entry.get("media_content") or []
    if media_contents and isinstance(media_contents, list):
        url = media_contents[0].get("url")
        if url:
            return url

    enclosures = entry.get("enclosures") or []
    if enclosures and isinstance(enclosures, list):
        href = enclosures[0].get("href") or enclosures[0].get("url")
        if href:
            return href
    return None


async def _fetch_single_feed(
    client: httpx.AsyncClient, feed_info: Dict[str, str]
) -> Tuple[Dict[str, str], List[dict]]:
    """단일 공식 RSS 피드를 비동기로 가져와 파싱된 엔트리 목록을 반환합니다."""
    try:
        resp = await client.get(feed_info["url"])
        if resp.status_code != 200:
            return feed_info, []
        parsed = feedparser.parse(resp.text)
        return feed_info, list(parsed.entries[:5])
    except Exception as exc:
        logger.warning("RSS fetch skipped for %s: %s", feed_info["url"], exc)
        return feed_info, []


async def collect_rss_candidates(max_candidates: int = 45) -> List[RawNewsCandidate]:
    """
    Step 1. 멀티 RSS 병렬 수집 & 중복 제거 (0 토큰)
    각 언론사 공식 RSS에서 최신 기사를 병렬 비동기로 수집하여 후보 풀(Pool)을 반환합니다.
    """
    candidates: List[RawNewsCandidate] = []
    seen_urls: set[str] = set()
    seen_title_prefixes: set[str] = set()

    headers = {
        "User-Agent": "DewPlatformRSSReader/1.0 (+https://dew.local; Official-RSS-Only)"
    }

    async with httpx.AsyncClient(
        timeout=7.0, follow_redirects=True, headers=headers
    ) as client:
        tasks = [_fetch_single_feed(client, feed) for feed in OFFICIAL_RSS_FEEDS]
        feed_results = await asyncio.gather(*tasks)

        for feed_info, entries in feed_results:
            for entry in entries:
                title = clean_html_text(entry.get("title"), max_len=120)
                link = (entry.get("link") or "").strip()
                if not title or not link or link in seen_urls:
                    continue

                # 유사 헤드라인 중복 방지 (앞 14글자 기준)
                prefix = re.sub(r"[^가-힣a-zA-Z0-9]", "", title)[:14]
                if prefix and prefix in seen_title_prefixes:
                    continue

                seen_urls.add(link)
                if prefix:
                    seen_title_prefixes.add(prefix)

                # 저작권 안전 원칙: 본문(content:encoded)은 DB에 저장하지 않고 짧은 요약만 정제
                raw_desc = entry.get("summary") or entry.get("description") or ""
                summary_short = clean_html_text(raw_desc, max_len=180)
                if summary_short == title:
                    summary_short = ""

                candidates.append(
                    RawNewsCandidate(
                        candidate_id=len(candidates) + 1,
                        press_name=feed_info["press"],
                        hint_category=feed_info["hint_category"],
                        title=title,
                        original_url=link,
                        thumbnail_url=_extract_thumbnail(entry),
                        summary_raw=summary_short,
                    )
                )
                if len(candidates) >= max_candidates:
                    return candidates

    return candidates


async def enrich_missing_summaries_with_naver(
    selected_candidates: List[RawNewsCandidate],
) -> None:
    """
    Step 3. 네이버 뉴스 공식 검색 API 요약 보강 (선별된 15건 중 description이 비어 있는 기사만 호출)
    """
    if not settings.NAVER_CLIENT_ID or not settings.NAVER_CLIENT_SECRET:
        return

    headers = {
        "X-Naver-Client-Id": settings.NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": settings.NAVER_CLIENT_SECRET,
    }

    async with httpx.AsyncClient(timeout=5.0, headers=headers) as client:
        for item in selected_candidates:
            if item.summary_raw and len(item.summary_raw.strip()) >= 20:
                continue
            try:
                resp = await client.get(
                    "https://openapi.naver.com/v1/search/news.json",
                    params={"query": item.title[:40], "display": 1, "sort": "sim"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    items = data.get("items") or []
                    if items:
                        item.summary_raw = clean_html_text(
                            items[0].get("description", ""), max_len=180
                        )
            except Exception as exc:
                logger.warning(
                    "Naver API enrichment failed for '%s': %s", item.title, exc
                )
