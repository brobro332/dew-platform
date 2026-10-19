# 🖥️ 02. Next.js 프론트엔드 대시보드(`next-js-app`) 및 컨테이너 구현 내역

> **작업 일자**: 2026-10-19  
> **참조 설계서**: [`docs/spec/DEW_PROJECT_SPEC.md`](../spec/DEW_PROJECT_SPEC.md)  
> **요약**: FastAPI 백엔드(`http://localhost:8000`)와 연동되는 Next.js App Router 기반 4대 핵심 화면(오늘의 주요뉴스 대시보드, 나만의 AI 단어사전, 영구 스크랩 보관함, 알림·케어 설정) 및 Docker 배포 구성을 구현한 문서입니다.

---

## 1. 📂 구현된 프론트엔드 디렉터리 구조

```text
next-js-app/
├── Dockerfile                        # Node 20 Alpine 멀티 스테이지 프로덕션 빌드 이미지
├── .dockerignore                     # node_modules, .next 등 빌드 컨텍스트 제외
├── lib/
│   └── api.ts                        # 백엔드 API 연동 클라이언트 & TypeScript DTO 타입 정의
├── components/
│   ├── Navbar.tsx                    # 상단 고정 네비게이션 탭 & 실시간 유저 보유 단어/스크랩 뱃지
│   └── HighlightedText.tsx           # 뉴스 본문 내 '내 단어사전' 등록 단어 형광펜 하이라이트 & 툴팁
└── app/
    ├── layout.tsx                    # 한국어 메타데이터, 공통 레이아웃 및 헤더/푸터
    ├── page.tsx                      # [메인] 오늘의 5대 분야 주요뉴스 & AI 눈높이 브리핑 대시보드
    ├── words/
    │   └── page.tsx                  # [단어사전] 카테고리별 단어 관리 & AI 내용 보정(Before/After) 뷰
    ├── scraps/
    │   └── page.tsx                  # [스크랩] 영구 보관 뉴스 아카이브 & 한 줄 생각 메모 관리
    └── settings/
        └── page.tsx                  # [설정] 디스코드 웹훅 URL, 관심 분야, 알림 시각 및 즉시 테스트 발송
```

---

## 2. ✨ 화면별 주요 구현 기능

### 2.1 공통 네비게이션 및 형광펜 컴포넌트 (`components/`)
- **`Navbar.tsx`**:
  - 페이지 이동 시 `GET /api/me`를 호출하여 현재 Cloudflare Zero Trust 인증 유저(로컬 개발 시 `dev@dew.local`)의 닉네임, 이메일, 누적 단어 수, 스크랩 수를 상단 우측 뱃지에 실시간 표시합니다.
- **`HighlightedText.tsx`**:
  - 백엔드에서 내려준 `matched_words` 배열을 정규식으로 매칭하여 뉴스 제목, 3줄 요약, `So What?` 코멘트 본문에서 내가 단어사전에 등록해 둔 용어를 **노란 형광펜(`<mark>`)**으로 강조합니다.
  - 마우스를 올리면 카테고리명과 내가 정리한(또는 AI가 보정한) 단어 뜻이 담긴 툴팁이 즉시 팝업됩니다.

### 2.2 오늘의 주요뉴스 대시보드 (`app/page.tsx`)
- **5대 표준 분야 탭 필터**: `전체`, `📈 경제/금융`, `💰 증권/부동산`, `💻 IT/테크`, `🏛️ 사회/생활`, `🌍 글로벌` 분야별 건수 뱃지 및 즉시 필터링
- **수동 수집 트리거**: `[🔄 지금 뉴스 수집 & AI 브리핑 생성]` 버튼(`POST /api/news/collect`)으로 원하는 시점에 즉시 4대 언론사 공식 RSS 수집 및 2-Step AI 브리핑 생성 가능
- **브리핑 카드**:
  - `📝 3줄 핵심 요약` + `💡 왜 중요할까? (So What?)` 눈높이 해설 제공
  - `📕 AI 핵심 용어 콕 집기`: 추출된 용어 옆 `[+ 단어장 추가]` 클릭 시 선택한 카테고리 폴더로 원클릭 저장(`POST /api/news/{id}/to-word`) 및 출처 뉴스 스냅샷 보존
  - `📌 영구 스크랩 & 💬 메모`: 기사별 한 줄 생각 코멘트 작성 및 영구 보관함 토글(`POST /api/news/{id}/scrap`)

### 2.3 나만의 AI 단어사전 (`app/words/page.tsx`)
- **사용자 정의 카테고리 폴더**: 원하는 색상 코드와 이름으로 카테고리를 추가(`POST /api/categories`)하고 폴더별로 필터링
- **AI 내용 보정 워크플로우 (Before / After 비교)**:
  1. 단어명(필수) + 내가 이해한 초안 메모(선택) 입력 후 `[✨ AI 내용 보정]` 클릭(`POST /api/words/preview-ai`)
  2. **Before(내 초안 및 교정 코멘트)**와 **After(한 줄 정의, 상세 정의, 실전 활용 예문 2개, 연관/반대 키워드)**를 나란히 비교
  3. `[✨ AI 교정본으로 깔끔하게 저장]` 또는 `[내 원본 초안 + AI 보정본 함께 병합 저장]` 선택 반영(`POST /api/words`)
- **학습 상태 및 출처 스냅샷**:
  - `📖 학습 중` ↔ `✅ 숙지 완료` 원클릭 토글(`PATCH /api/words/{id}`)
  - 뉴스에서 원클릭 추가한 단어는 원문 뉴스가 3일 뒤 TTL로 삭제되어도 하단에 `📰 출처 뉴스` 제목과 원문 링크가 영구 표시됩니다.

### 2.4 영구 스크랩 보관함 (`app/scraps/page.tsx`)
- 내가 스크랩한 뉴스(`GET /api/news/scraps`)를 분야별·키워드별로 모아보고, 기록해 둔 한 줄 생각을 언제든 수정하거나 스크랩 해제할 수 있습니다.

### 2.5 알림·케어 설정 (`app/settings/page.tsx`)
- 개인 디스코드 웹훅 URL, 수신할 관심 분야 체크박스, 매일 아침 알림 시각(`daily_cron_time`), 주간 복습 리마인드 여부를 설정(`PUT /api/settings`)합니다.
- `[🚀 내 디스코드로 테스트 브리핑 즉시 발송]` 버튼(`POST /api/notifications/test`)으로 휴대폰 디스코드 푸시 알림 연동을 즉시 검증할 수 있습니다.
