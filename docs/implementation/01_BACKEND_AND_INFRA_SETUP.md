# 🛠️ 01. 인프라(Docker/DB) 및 FastAPI 백엔드 초기 구축 내역

> **작업 일자**: 2026-10-17  
> **참조 설계서**: [`docs/spec/DEW_PROJECT_SPEC.md`](../spec/DEW_PROJECT_SPEC.md)  
> **요약**: Dew Platform의 멀티 유저 PostgreSQL 15 스키마, Docker Compose 실행 환경, 그리고 공식 RSS 수집·2-Step AI 브리핑·단어사전·디스코드 알림을 담당하는 FastAPI 백엔드(`fastapi-app/`) 구현 문서입니다.

---

## 1. 📂 구현된 디렉터리 및 파일 구조

```text
dew-platform/
├── .gitignore                          # .env, .venv, node_modules, postgres_data 등 Git 추적 제외
├── .env                                # 로컬/컨테이너 실행용 환경변수 (Git 미추적)
├── docker-compose.yml                  # db(PostgreSQL 15) + backend(FastAPI) + frontend(Next.js)
├── init/
│   └── 01_schema.sql                   # 초기 멀티 유저 6개 테이블 및 인덱스 DDL
├── docs/
│   ├── spec/
│   │   └── DEW_PROJECT_SPEC.md         # 전체 서비스 기획 및 아키텍처 설계서
│   └── implementation/
│       └── 01_BACKEND_AND_INFRA_SETUP.md # 현재 구현 상세 문서
└── fastapi-app/                        # Python FastAPI 백엔드 서버
    ├── Dockerfile                      # Python 3.12-slim + Asia/Seoul 타임존 고정 이미지
    ├── requirements.txt                # 백엔드 파이썬 의존성 목록
    └── app/
        ├── main.py                     # FastAPI 앱 엔트리포인트, CORS, Lifespan(DB 확인 & 스케줄러 구동)
        ├── core/
        │   ├── config.py               # pydantic-settings 기반 환경변수 및 5대 표준 카테고리 설정
        │   ├── database.py             # SQLModel Engine, init_db(), get_session() 의존성
        │   └── auth.py                 # Cloudflare Zero Trust 헤더 JIT Provisioning 및 로컬 개발 폴백
        ├── models/
        │   ├── user.py                 # AppUser 엔티티 및 프로필 응답 DTO
        │   ├── word.py                 # WordCategory, WordEntry 엔티티 및 AI 미리보기/단어 DTO
        │   ├── news.py                 # DailyNews, UserNewsScrap 엔티티 및 형광펜 매칭 DTO
        │   └── setting.py              # CareSetting 엔티티 및 설정 변경 DTO
        ├── services/
        │   ├── rss_collector.py        # 매경·SBS·연합뉴스TV·한경 공식 RSS 비동기 수집 + 네이버 뉴스 API 보강
        │   ├── ai_engine.py            # Antigravity SDK(deny("*")) + Groq/Gemini REST 하이브리드 AI 엔진
        │   ├── discord_notifier.py     # 디스코드 Embed 10개 제한 준수 분야별 브리핑 카드 생성/발송기
        │   └── scheduler.py            # APScheduler (모닝 뉴스 수집, 유저별 디스코드 발송, 자정 TTL 삭제)
        └── routers/
            ├── settings.py             # /api/me, /api/settings, /api/notifications/test
            ├── words.py                # /api/categories, /api/words/preview-ai, /api/words
            └── news.py                 # /api/news/daily, /api/news/collect, /api/news/{id}/scrap, /api/news/{id}/to-word
```

---

## 2. 🗄️ 데이터베이스 및 인프라 구현 상세

### 2.1 `docker-compose.yml`
- **`db` (`postgres:15-alpine`)**:
  - `./init:/docker-entrypoint-initdb.d:ro` 마운트를 통해 컨테이너 최초 기동 시 `01_schema.sql`을 자동 실행합니다.
  - `pg_isready` 헬스체크가 통과된 후 `backend` 컨테이너가 구동되도록 `depends_on` 조건을 설정했습니다.
- **`backend` (`./fastapi-app`)**:
  - `TZ=Asia/Seoul` 환경변수와 컨테이너 내부 `/etc/localtime` 심볼릭 링크를 통해 한국 시간(KST) 기준으로 스케줄러가 동작합니다.
- **`frontend` (`./next-js-app`)**:
  - 백엔드 API(`http://localhost:8000`)와 연동되는 Next.js 컨테이너 구성을 포함합니다.

### 2.2 멀티 유저 스키마 (`init/01_schema.sql`)
1. **`app_user`**: Cloudflare Access 인증 이메일(`email` UK), 닉네임, 최초 생성일 및 마지막 접속일 관리
2. **`word_category`**: 유저별 단어장 폴더/카테고리 (`name`, `color_code`, `sort_order`)
3. **`daily_news`**: 전 유저가 공유하는 일일 5대 분야 주요뉴스 및 AI 해설 (`ai_briefing` JSONB, `extracted_terms` JSONB)
4. **`word_entry`**: 나만의 단어사전 항목
   - **출처 보호 설계**: 뉴스에서 등록한 단어의 원문 뉴스가 스크랩되지 않아 3일 뒤 자동 삭제되더라도 출처가 유실되지 않도록 `source_news_id REFERENCES daily_news(id) ON DELETE SET NULL`과 함께 `source_news_title`, `source_news_url` 스냅샷 컬럼을 영구 보존합니다.
5. **`user_news_scrap`**: 유저별 영구 스크랩 뉴스 매핑 및 한 줄 메모 (`UNIQUE(user_id, news_id)`)
6. **`care_setting`**: 유저별 개인 디스코드 웹훅 URL, 구독 분야 목록(`active_categories`), 알림 시각(`daily_cron_time`)

---

## 3. ⚙️ 핵심 백엔드 모듈 설명

### 3.1 무가입 멀티 유저 JIT 인증 (`app/core/auth.py`)
- 요청 헤더의 `Cf-Access-Authenticated-User-Email` 값을 읽어 현재 유저를 식별합니다.
- 로컬 개발 환경에서 해당 헤더가 없을 경우 `.env`의 `DEV_DEFAULT_EMAIL`(`dev@dew.local`)로 자동 폴백합니다.
- **Just-In-Time (JIT) Provisioning**: DB에 없는 이메일로 최초 요청이 들어오면 아래 초기 데이터를 한 트랜잭션으로 자동 생성합니다:
  1. `app_user` 레코드 생성
  2. 기본 단어장 카테고리 4종 (`경제/금융`, `IT/개발`, `시사/교양`, `비즈니스 어휘`) 생성
  3. 기본 알림 설정 (`care_setting`, 5대 표준 분야 구독, `07:30` 알림) 생성

### 3.2 공식 RSS 수집 및 2-Step AI 다이어트 파이프라인 (`app/services/`)
- **`rss_collector.py`**:
  - 매일경제, SBS 뉴스, 연합뉴스TV, 한국경제의 공식 RSS 피드에서 최근 기사를 비동기로 수집하고 유사 제목 및 중복 URL을 제거합니다.
  - 저작권 보호 원칙에 따라 본문은 DB에 저장하지 않으며, 한국경제 등 `description`이 비어 있는 선별 기사에 한해 **네이버 뉴스 검색 공식 API**로 짧은 요약 패시지를 보충합니다.
- **`ai_engine.py`**:
  - **1차 선별 (`select_top_news_step1`)**: 후보 기사의 `[ID] 제목`만 전달해 5대 표준 분야별 Top 3(총 15건)를 선별합니다.
  - **2차 해설 (`generate_briefings_step2`)**: 선별된 15건에 대해서만 `3줄 핵심 요약`, `왜 중요할까?(So What?)`, `핵심 용어 콕 집기`를 생성합니다.
  - **안전 잠금장치**: `google-antigravity` SDK 호출 시 `policies=[deny("*")]`와 30초 타임아웃을 적용해 서버 리소스 접근이나 승인 대기 멈춤(Hang)을 원천 차단하며, 미설치/타임아웃 시 즉시 Groq 또는 Gemini Flash REST API로 폴백합니다.

### 3.3 시너지 기능 및 스케줄러 (`app/routers/news.py`, `app/services/scheduler.py`)
- **내 단어장 형광펜 매칭**: `GET /api/news/daily` 호출 시 당일 뉴스 제목·요약·해설에 사용자가 단어사전에 등록해 둔 단어가 등장하면 `matched_words` 배열로 반환하여 프론트엔드에서 즉시 형광펜 하이라이트 및 뜻 툴팁을 표시할 수 있습니다.
- **원클릭 단어사전 추가**: `POST /api/news/{news_id}/to-word` 호출 시 뉴스 출처 스냅샷(`source_news_title`, `source_news_url`)과 AI 보정 정의를 함께 단어사전에 즉시 저장합니다.
- **Multi-User Safe TTL 스케줄러**: 매일 자정(`00:05 KST`) 어느 유저도 스크랩하지 않은(`NOT EXISTS`) 기한 경과 뉴스만 안전하게 정리합니다.

---

## 4. 🔌 구현된 API 엔드포인트 목록

| 구분 | Method | Endpoint | 설명 |
| :---: | :---: | :--- | :--- |
| **헬스체크** | `GET` | `/health` | 서버 상태, 버전 및 타임존(`Asia/Seoul`) 확인 |
| **계정/프로필** | `GET` | `/api/me` | 현재 인증 유저 프로필 및 보유 단어·스크랩 수 조회 (최초 호출 시 자동 가입) |
| **알림/설정** | `GET` | `/api/settings` | 내 관심 분야, 알림 시각, 디스코드 웹훅 설정 조회 |
| **알림/설정** | `PUT` | `/api/settings` | 내 관심 분야, 알림 시각, 디스코드 웹훅 URL 수정 |
| **알림/설정** | `POST` | `/api/notifications/test` | 내 디스코드 웹훅으로 테스트 브리핑 즉시 발송 |
| **단어사전** | `GET` | `/api/categories` | 내 단어장 카테고리 목록 및 카테고리별 단어 수 조회 |
| **단어사전** | `POST` | `/api/categories` | 새 단어장 카테고리 생성 |
| **단어사전** | `POST` | `/api/words/preview-ai` | 단어 등록 전 AI 내용 보정 미리보기 (메모 교정 + 한 줄 정의 + 예문 2개) |
| **단어사전** | `POST` | `/api/words` | 단어 최종 저장 |
| **단어사전** | `GET` | `/api/words` | 카테고리별 / 검색어별 / 숙지 여부별 단어 목록 조회 |
| **단어사전** | `PATCH` | `/api/words/{word_id}` | 단어 내용 또는 숙지 완료(`is_memorized`) 상태 수정 |
| **단어사전** | `DELETE` | `/api/words/{word_id}` | 단어 삭제 |
| **주요뉴스** | `GET` | `/api/news/daily` | 날짜별·분야별 주요뉴스 조회 (스크랩 여부 + 내 단어 형광펜 매칭 포함) |
| **주요뉴스** | `POST` | `/api/news/collect` | 공식 RSS 수집 및 AI 브리핑 생성 즉시 수동 실행 |
| **주요뉴스** | `POST` | `/api/news/{news_id}/scrap` | 특정 뉴스 영구 보관함 스크랩 토글 및 한 줄 메모 저장 |
| **주요뉴스** | `GET` | `/api/news/scraps` | 내가 영구 스크랩한 뉴스 보관함 목록 조회 |
| **주요뉴스** | `POST` | `/api/news/{news_id}/to-word` | 뉴스 내 핵심 용어를 출처 스냅샷과 함께 내 단어사전에 원클릭 등록 |

---

## 5. 🚀 로컬 실행 및 확인 방법

```powershell
# 1. PostgreSQL DB 컨테이너 실행 (또는 전체 스택 실행)
docker compose up -d db

# 2. FastAPI 백엔드 단독 실행 (로컬 가상환경)
cd fastapi-app
.\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000

# 3. Swagger UI 문서 확인
# 브라우저에서 http://localhost:8000/docs 접속
```
