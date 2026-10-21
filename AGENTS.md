# Dew Platform — Agent Harness & Engineering Rules

> **AI 라이프·지식 케어 파트너 (Dew Platform)**
> 당일 5대 분야 주요뉴스 AI 눈높이 브리핑(`daily_news`)과 나만의 단어사전(`word_entry`)이 선순환으로 연결되는 멀티 유저 플랫폼입니다.

---

## 1. 아키텍처 및 컨테이너 구성

| 서비스 | 컨테이너명 | 포트 (Host -> Container) | 경로 | 핵심 기술 스택 |
| :--- | :--- | :--- | :--- | :--- |
| **Database** | `dew-postgres` | `5433:5432` | `init/01_schema.sql` | PostgreSQL 15 (Alpine) |
| **Backend** | `dew-backend` | `8000:8000` | `fastapi-app/` | Python 3.12, FastAPI, SQLModel, APScheduler |
| **Frontend** | `dew-frontend` | `3000:3000` | `next-js-app/` | Next.js 16 (App Router), React 19, Tailwind CSS v4 |

---

## 2. 핵심 도메인 불변 규칙 (Invariants)

1. **저작권 안전 원칙 (Zero Copyright Risk)**
   - 언론사 웹사이트 HTML 무단 크롤링을 금지하며, 오직 **공식 RSS 피드**(`rss_collector.py`)와 **네이버 뉴스 공식 검색 API**만 사용합니다.
   - 기사 원문 본문은 DB에 저장하지 않으며(`제목 + 원문 링크 + 짧은 요약 + AI 자체 해설`만 저장), 인메모리 처리 후 즉시 폐기합니다.

2. **하이브리드 AI 엔진 및 안전 잠금장치 (`ai_engine.py`)**
   - `google-antigravity` SDK 호출 시 반드시 `policies=[deny("*")]`와 타임아웃(`30초`)을 적용하여 파일/쉘 도구 실행 및 승인 대기(Hang)를 차단합니다.
   - 외부 LLM 키(`GROQ_API_KEY`, `GEMINI_API_KEY`) 미설정 시에도 에러 없이 로컬 폴백(`local-fallback`)으로 동작해야 합니다.

3. **한국어 형태소·조사 정규화 (`normalize_korean_term`)**
   - 뉴스 핵심 용어 추출(`extracted_terms`) 및 단어사전 등록(`WordEntry.term`) 시 반드시 `normalize_korean_term()`을 거쳐 끝에 결합된 조사·어미(예: `"소리는"` → `"소리"`, `"부실시공에"` → `"부실시공"`)를 분리합니다.
   - 단순 금액·수량·기수 어절(예: `"12억원"`, `"60억"`, `"17억원"`, `"이래3"`)은 핵심 용어 후보에서 제외합니다.
   - 동일 유저가 같은 단어(`term`)를 중복 등록할 경우 새 행을 중복 생성하지 않고 기존 항목을 Upsert(갱신)합니다.

4. **날짜 지정 조회 및 수집 일관성 (`target_date`)**
   - 사용자가 대시보드에서 특정 날짜(예: 어제 날짜)를 선택했을 때 오늘 날짜로 강제 리셋되지 않아야 합니다.
   - `POST /api/news/collect?target_date=YYYY-MM-DD` 호출 시 지정된 `target_date` 기준으로 브리핑을 생성·갱신하고 해당 날짜를 반환합니다.

---

## 3. 작업 완료 전 필수 검증 루프 (Verification Harness)

코드 수정 후 작업을 완료하기 전에 반드시 아래 검증 하네스를 실행하여 통과 여부를 확인합니다:

```powershell
# 1. 통합 검증 하네스 스크립트 실행 (단위 검증 + 컨테이너 상태 + API/프론트엔드 헬스체크)
powershell -ExecutionPolicy Bypass -File .\scripts\verify_harness.ps1

# 2. 백엔드 컨테이너 내 하네스 테스트 단독 실행
docker exec dew-backend python -m unittest discover -s tests -p "test_*.py" -v
```
