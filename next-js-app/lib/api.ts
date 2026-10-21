export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export const STANDARD_NEWS_CATEGORIES = [
  { key: "경제/금융", label: "경제/금융", icon: "📈", badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800" },
  { key: "증권/부동산", label: "증권/부동산", icon: "💰", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800" },
  { key: "IT/테크", label: "IT/테크", icon: "💻", badgeClass: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800" },
  { key: "사회/생활", label: "사회/생활", icon: "🏛️", badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800" },
  { key: "글로벌", label: "글로벌", icon: "🌍", badgeClass: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800" },
] as const;

export interface UserProfile {
  id: number;
  email: string;
  nickname: string;
  created_at: string;
  last_login_at: string;
  word_count: number;
  scrap_count: number;
}

export interface MatchedWordHighlight {
  word_id: number;
  term: string;
  definition: string;
  category_name?: string | null;
}

export interface ExtractedTerm {
  term: string;
  definition: string;
}

export interface AiBriefingData {
  three_line_summary?: string[];
  so_what?: string;
}

export interface DailyNewsItem {
  id: number;
  briefing_date: string;
  category: string;
  press_name: string;
  title: string;
  original_url: string;
  thumbnail_url?: string | null;
  summary_raw?: string | null;
  ai_briefing: AiBriefingData;
  extracted_terms: ExtractedTerm[];
  is_scrapped: boolean;
  user_memo?: string | null;
  matched_words: MatchedWordHighlight[];
  created_at: string;
}

export interface WordCategory {
  id: number;
  name: string;
  color_code: string;
  sort_order: number;
  word_count: number;
  created_at: string;
}

export interface AiSupplementData {
  one_line_definition?: string;
  corrected_user_memo?: string;
  examples?: string[];
  related_keywords?: string[];
  opposite_keywords?: string[];
}

export interface WordEntry {
  id: number;
  user_id: number;
  category_id?: number | null;
  source_news_id?: number | null;
  source_news_title?: string | null;
  source_news_url?: string | null;
  term: string;
  user_definition?: string | null;
  ai_refined_definition?: string | null;
  ai_supplement: AiSupplementData;
  is_memorized: boolean;
  created_at: string;
  updated_at: string;
}

export interface WordPreviewResponse {
  term: string;
  user_definition?: string | null;
  corrected_user_memo: string;
  one_line_definition: string;
  ai_refined_definition: string;
  examples: string[];
  related_keywords: string[];
  opposite_keywords: string[];
  engine_used: string;
}

export interface CareSetting {
  id?: number;
  user_id: number;
  discord_webhook_url?: string | null;
  active_categories: string[];
  daily_cron_time: string;
  weekly_remind_enabled: boolean;
  is_active: boolean;
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let errorDetail = `요청 실패 (HTTP ${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.detail) {
        errorDetail =
          typeof errJson.detail === "string"
            ? errJson.detail
            : JSON.stringify(errJson.detail);
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errorDetail);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

// 1. Profile & Settings API
export const fetchMyProfile = () => apiRequest<UserProfile>("/api/me");

export const fetchCareSettings = () => apiRequest<CareSetting>("/api/settings");

export const updateCareSettings = (payload: Partial<CareSetting>) =>
  apiRequest<CareSetting>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const sendTestDiscordNotification = () =>
  apiRequest<{ status: string; target_date: string }>(
    "/api/notifications/test",
    {
      method: "POST",
    }
  );

// 2. Daily News & Synergy API
export const fetchDailyNews = (params?: {
  target_date?: string;
  category?: string;
}) => {
  const search = new URLSearchParams();
  if (params?.target_date) search.set("target_date", params.target_date);
  if (params?.category) search.set("category", params.category);
  const qs = search.toString();
  return apiRequest<DailyNewsItem[]>(`/api/news/daily${qs ? `?${qs}` : ""}`);
};

export const triggerNewsCollection = (targetDate?: string) => {
  const qs = targetDate ? `?target_date=${encodeURIComponent(targetDate)}` : "";
  return apiRequest<{
    status: string;
    collected_count: number;
    briefing_date: string;
  }>(`/api/news/collect${qs}`, {
    method: "POST",
  });
};

export const toggleNewsScrap = (newsId: number, userMemo?: string | null) =>
  apiRequest<{
    news_id: number;
    is_scrapped: boolean;
    user_memo?: string | null;
  }>(`/api/news/${newsId}/scrap`, {
    method: "POST",
    body: JSON.stringify({ user_memo: userMemo ?? null }),
  });

export const fetchScrappedNews = () =>
  apiRequest<DailyNewsItem[]>("/api/news/scraps");

export const addNewsTermToVocabulary = (
  newsId: number,
  payload: {
    term: string;
    definition?: string;
    category_id?: number | null;
    user_memo?: string;
  }
) =>
  apiRequest<WordEntry>(`/api/news/${newsId}/to-word`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

// 3. Vocabulary Vault API
export const fetchCategories = () =>
  apiRequest<WordCategory[]>("/api/categories");

export const createCategory = (payload: {
  name: string;
  color_code?: string;
  sort_order?: number;
}) =>
  apiRequest<WordCategory>("/api/categories", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const previewWordWithAI = (payload: {
  term: string;
  user_definition?: string;
}) =>
  apiRequest<WordPreviewResponse>("/api/words/preview-ai", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const createWord = (payload: {
  category_id?: number | null;
  term: string;
  user_definition?: string | null;
  ai_refined_definition?: string | null;
  ai_supplement?: AiSupplementData;
  source_news_id?: number | null;
  source_news_title?: string | null;
  source_news_url?: string | null;
}) =>
  apiRequest<WordEntry>("/api/words", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchWords = (params?: {
  category_id?: number | null;
  q?: string;
  is_memorized?: boolean | null;
}) => {
  const search = new URLSearchParams();
  if (params?.category_id !== undefined && params?.category_id !== null) {
    search.set("category_id", String(params.category_id));
  }
  if (params?.q && params.q.trim()) {
    search.set("q", params.q.trim());
  }
  if (params?.is_memorized !== undefined && params?.is_memorized !== null) {
    search.set("is_memorized", String(params.is_memorized));
  }
  const qs = search.toString();
  return apiRequest<WordEntry[]>(`/api/words${qs ? `?${qs}` : ""}`);
};

export const updateWord = (
  wordId: number,
  payload: Partial<{
    category_id: number | null;
    term: string;
    user_definition: string | null;
    ai_refined_definition: string | null;
    ai_supplement: AiSupplementData;
    is_memorized: boolean;
  }>
) =>
  apiRequest<WordEntry>(`/api/words/${wordId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const deleteWord = (wordId: number) =>
  apiRequest<void>(`/api/words/${wordId}`, {
    method: "DELETE",
  });
