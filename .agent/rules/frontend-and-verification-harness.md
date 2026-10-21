# Frontend & Verification Harness Rules

## 1. 날짜 필터(`targetDate`) 상태 유지 규칙 (`next-js-app/app/page.tsx`)
- `loadData(dateFilter)`의 `useCallback` 의존성 배열에 카테고리 상태(`selectedWordCategoryId`) 등을 넣어 불필요한 재호출로 `targetDate`가 초기화되는 일이 없도록 유지합니다.
- 사용자가 `<input type="date">`로 날짜를 변경하면 해당 날짜에 뉴스가 0건이더라도 `targetDate`가 오늘 날짜로 되돌아가지 않아야 합니다.
- `handleManualCollect` 실행 시 현재 선택된 `targetDate`를 `triggerNewsCollection(targetDate || undefined)`에 전달하여 선택한 날짜 기준으로 수집·갱신되도록 유지합니다.

## 2. Docker 컨테이너 배포 및 포트 바인딩 검증
- `fastapi-app` 또는 `next-js-app` 코드를 수정한 뒤 Docker 환경에 반영할 때는 `docker compose up -d --build`를 수행하고, `dew-frontend`(`0.0.0.0:3000->3000/tcp`)와 `dew-backend`(`0.0.0.0:8000->8000/tcp`) 포트 바인딩이 열려 있는지 확인합니다.
