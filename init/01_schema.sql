-- ============================================================================
-- Dew Platform — 초기 데이터베이스 스키마 (PostgreSQL 15)
-- 참조 문서: docs/DEW_PROJECT_SPEC.md (섹션 5. 멀티 유저 ERD 및 TTL 정책)
-- ============================================================================

SET TIME ZONE 'Asia/Seoul';

-- 1. APP_USER: Cloudflare Zero Trust 인증 기반 멀티 유저 테이블
CREATE TABLE IF NOT EXISTS app_user (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    nickname VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. WORD_CATEGORY: 유저별 커스텀 단어사전 카테고리
CREATE TABLE IF NOT EXISTS word_category (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color_code VARCHAR(30) NOT NULL DEFAULT '#3B82F6',
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_word_category_user_sort
    ON word_category(user_id, sort_order);

-- 3. DAILY_NEWS: 일일 5대 표준 분야 주요뉴스 & AI 눈높이 브리핑 (전 유저 공유)
CREATE TABLE IF NOT EXISTS daily_news (
    id BIGSERIAL PRIMARY KEY,
    briefing_date DATE NOT NULL DEFAULT CURRENT_DATE,
    category VARCHAR(50) NOT NULL,
    press_name VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    original_url VARCHAR(1000) NOT NULL UNIQUE,
    thumbnail_url VARCHAR(1000),
    summary_raw TEXT,
    ai_briefing JSONB NOT NULL DEFAULT '{}'::jsonb,
    extracted_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_news_date_category
    ON daily_news(briefing_date DESC, category);

-- 4. WORD_ENTRY: 나만의 단어사전 항목 (뉴스 삭제 시에도 출처 스냅샷 보존)
CREATE TABLE IF NOT EXISTS word_entry (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    category_id BIGINT REFERENCES word_category(id) ON DELETE SET NULL,
    source_news_id BIGINT REFERENCES daily_news(id) ON DELETE SET NULL,
    source_news_title VARCHAR(500),
    source_news_url VARCHAR(1000),
    term VARCHAR(200) NOT NULL,
    user_definition TEXT,
    ai_refined_definition TEXT,
    ai_supplement JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_memorized BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_word_entry_user_category
    ON word_entry(user_id, category_id);
CREATE INDEX IF NOT EXISTS idx_word_entry_user_term
    ON word_entry(user_id, term);

-- 5. USER_NEWS_SCRAP: 유저별 영구 뉴스 스크랩 보관함 & 한 줄 메모
CREATE TABLE IF NOT EXISTS user_news_scrap (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    news_id BIGINT NOT NULL REFERENCES daily_news(id) ON DELETE CASCADE,
    user_memo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_news_scrap UNIQUE (user_id, news_id)
);

CREATE INDEX IF NOT EXISTS idx_user_news_scrap_user
    ON user_news_scrap(user_id, created_at DESC);

-- 6. CARE_SETTING: 유저별 디스코드 웹훅, 관심 뉴스 분야, 알림 스케줄 설정
CREATE TABLE IF NOT EXISTS care_setting (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
    discord_webhook_url VARCHAR(1000),
    active_categories JSONB NOT NULL DEFAULT '["경제/금융", "증권/부동산", "IT/테크", "사회/생활", "글로벌"]'::jsonb,
    daily_cron_time VARCHAR(10) NOT NULL DEFAULT '07:30',
    weekly_remind_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);
