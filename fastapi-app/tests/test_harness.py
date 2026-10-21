import unittest
from datetime import date
from fastapi.testclient import TestClient

from app.main import app
from app.services.ai_engine import (
    _extract_fallback_terms,
    _is_valid_keyword_candidate,
    normalize_korean_term,
)


class DewPlatformHarnessTest(unittest.TestCase):
    """Dew Platform 핵심 도메인(한국어 형태소/조사 분리, 숫자 노이즈 제거, 날짜 지정 API) 검증 하네스."""

    def test_korean_morpheme_normalization_strips_particles(self) -> None:
        """조사와 어미가 결합된 한국어 어절에서 명사 원형만 정확히 분리하는지 검증합니다."""
        cases = {
            "소리는": "소리",
            "소리에서는": "소리",
            "부실시공에": "부실시공",
            "반도체의": "반도체",
            "기준금리를": "기준금리",
            "삼성전자는": "삼성전자",
            "시장으로": "시장",
            "물가도": "물가",
            "기업들이": "기업",
            "'초글로벌'": "초글로벌",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(normalize_korean_term(raw), expected)

    def test_korean_morpheme_normalization_preserves_protected_nouns(self) -> None:
        """끝 글자가 조사(가/도/로/이)와 같지만 실제 명사 원형인 단어들이 훼손되지 않는지 검증합니다."""
        protected = [
            "물가",
            "주가",
            "국가",
            "제도",
            "속도",
            "금리",
            "분양가",
            "상한가",
            "전문가",
            "만족도",
            "신뢰도",
            "신도시",
            "고속도로",
            "어린이",
        ]
        for noun in protected:
            with self.subTest(noun=noun):
                self.assertEqual(normalize_korean_term(noun), noun)

    def test_fallback_term_extraction_filters_numbers_and_strips_particles(self) -> None:
        """폴백 키워드 추출 시 '12억원', '60억', '이래3' 같은 수치 노이즈를 걸러내고 명사만 추출하는지 검증합니다."""
        title = "이래3 부실시공에 12억원 및 60억 소리는 커진 반도체 시장의 전망"
        summary = "17억원 규모 기준금리를 둘러싼 전문가들의 분석"
        terms = _extract_fallback_terms("경제/금융", title, summary)
        extracted_words = [t["term"] for t in terms]

        self.assertTrue(len(extracted_words) >= 1)
        for word in extracted_words:
            self.assertFalse(word.endswith("는"), f"Particle not stripped: {word}")
            self.assertFalse(word.endswith("에"), f"Particle not stripped: {word}")
            self.assertNotIn(word, {"12억원", "60억", "17억원", "이래3"})

        self.assertIn("부실시공", extracted_words)
        self.assertIn("소리", extracted_words)

    def test_daily_news_date_filter_and_word_upsert_api(self) -> None:
        """날짜 지정 뉴스 조회(어제 날짜 등) 및 단어 등록 시 조사 제거·중복 방지(Upsert)를 검증합니다."""
        client = TestClient(app)

        # 1. 헬스체크
        health_resp = client.get("/health")
        self.assertEqual(health_resp.status_code, 200)

        # 2. 특정 과거 날짜(예: 2026-10-20)로 조회 시 에러 없이 동작하는지 확인
        daily_resp = client.get("/api/news/daily?target_date=2026-10-20")
        self.assertEqual(daily_resp.status_code, 200)
        for item in daily_resp.json():
            self.assertEqual(item["briefing_date"], "2026-10-20")

        # 3. 단어 등록 시 '소리는' 입력 -> '소리'로 정규화 저장 및 재등록 시 중복 없이 Upsert 검증
        create_resp1 = client.post(
            "/api/words",
            json={
                "term": "소리는",
                "user_definition": "테스트용 첫 번째 정의",
            },
        )
        self.assertEqual(create_resp1.status_code, 201)
        word1 = create_resp1.json()
        self.assertEqual(word1["term"], "소리")

        create_resp2 = client.post(
            "/api/words",
            json={
                "term": "소리를",
                "user_definition": "테스트용 업데이트된 정의",
            },
        )
        self.assertEqual(create_resp2.status_code, 201)
        word2 = create_resp2.json()
        self.assertEqual(word2["id"], word1["id"])
        self.assertEqual(word2["term"], "소리")
        self.assertEqual(word2["user_definition"], "테스트용 업데이트된 정의")

        # 테스트 단어 정리
        del_resp = client.delete(f"/api/words/{word1['id']}")
        self.assertEqual(del_resp.status_code, 204)


if __name__ == "__main__":
    unittest.main()
