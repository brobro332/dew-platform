"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  DailyNewsItem,
  fetchScrappedNews,
  STANDARD_NEWS_CATEGORIES,
  toggleNewsScrap,
} from "@/lib/api";

export default function ScrapsArchivePage() {
  const [scraps, setScraps] = useState<DailyNewsItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("전체");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [editingMemoId, setEditingMemoId] = useState<number | null>(null);
  const [memoInputs, setMemoInputs] = useState<Record<number, string>>({});

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const loadScraps = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchScrappedNews();
      setScraps(data);
      const map: Record<number, string> = {};
      data.forEach((n) => {
        if (n.user_memo) map[n.id] = n.user_memo;
      });
      setMemoInputs(map);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "스크랩 보관함을 불러오지 못했습니다.";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScraps();
  }, [loadScraps]);

  const handleSaveMemo = async (news: DailyNewsItem) => {
    try {
      const nextMemo = memoInputs[news.id] ?? "";
      const res = await toggleNewsScrap(news.id, nextMemo);
      setScraps((prev) =>
        prev.map((item) =>
          item.id === news.id ? { ...item, user_memo: res.user_memo } : item
        )
      );
      setEditingMemoId(null);
      showToast("💬 스크랩 한 줄 메모가 저장되었습니다.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "메모 수정에 실패했습니다.";
      setErrorMsg(message);
    }
  };

  const handleUnscrap = async (news: DailyNewsItem) => {
    try {
      await toggleNewsScrap(news.id, undefined);
      setScraps((prev) => prev.filter((item) => item.id !== news.id));
      showToast("🗑️ 스크랩 보관함에서 제거되었습니다.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "스크랩 해제에 실패했습니다.";
      setErrorMsg(message);
    }
  };

  const filteredScraps = scraps.filter((n) => {
    const matchCat =
      selectedCategory === "전체" || n.category === selectedCategory;
    if (!matchCat) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      (n.user_memo || "").toLowerCase().includes(q) ||
      (n.ai_briefing?.so_what || "").toLowerCase().includes(q)
    );
  });

  const getCategoryMeta = (catName: string) =>
    STANDARD_NEWS_CATEGORIES.find((c) => c.key === catName) || {
      key: catName,
      label: catName,
      icon: "📰",
      badgeClass: "bg-zinc-100 text-zinc-700 border-zinc-300",
    };

  return (
    <div className="space-y-6">
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md rounded-2xl bg-zinc-900 text-white px-4 py-3 text-sm font-medium shadow-xl">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <section className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 shadow-2xs">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-200 dark:border-blue-800">
            📌 Permanent News Archive
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            영구 스크랩 뉴스 보관함
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            일일 뉴스는 3일 뒤 자동 정리되지만, 내가 <strong>[스크랩]</strong>한
            뉴스와 한 줄 코멘트는 삭제되지 않고 영구 보관됩니다.
          </p>
        </div>
      </section>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategory("전체")}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer whitespace-nowrap ${
              selectedCategory === "전체"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800"
            }`}
          >
            전체 ({scraps.length})
          </button>
          {STANDARD_NEWS_CATEGORIES.map((cat) => {
            const cnt = scraps.filter((s) => s.category === cat.key).length;
            const active = selectedCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  active
                    ? "bg-blue-600 text-white"
                    : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                <span className="text-xs opacity-75">({cnt})</span>
              </button>
            );
          })}
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="스크랩 뉴스 제목·메모 검색..."
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {errorMsg && (
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">
          ⚠️ {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((n) => (
            <div
              key={n}
              className="h-44 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 animate-pulse"
            />
          ))}
        </div>
      ) : filteredScraps.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center space-y-3">
          <div className="text-3xl">📌</div>
          <h3 className="font-bold text-base text-zinc-800 dark:text-zinc-100">
            보관된 스크랩 뉴스가 없습니다
          </h3>
          <p className="text-xs sm:text-sm text-zinc-500">
            오늘의 주요뉴스 브리핑에서 다시 보고 싶은 기사에 [영구 스크랩]을
            눌러 나만의 인사이트 아카이브를 만들어 보세요.
          </p>
          <Link
            href="/"
            className="inline-block px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
          >
            ☀️ 오늘의 주요뉴스 보러가기
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredScraps.map((news) => {
            const catMeta = getCategoryMeta(news.category);
            const summaryLines =
              news.ai_briefing?.three_line_summary ||
              (news.summary_raw ? [news.summary_raw] : []);

            return (
              <article
                key={news.id}
                className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 shadow-2xs space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${catMeta.badgeClass}`}
                    >
                      <span>{catMeta.icon}</span>
                      <span>{catMeta.label}</span>
                    </span>
                    <span className="text-xs font-medium text-zinc-500 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
                      {news.press_name}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {news.briefing_date}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setEditingMemoId(
                          editingMemoId === news.id ? null : news.id
                        )
                      }
                      className="px-2.5 py-1 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 cursor-pointer"
                    >
                      💬 메모 수정
                    </button>
                    <button
                      onClick={() => handleUnscrap(news)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                    >
                      보관 해제
                    </button>
                  </div>
                </div>

                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  <a
                    href={news.original_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 transition-colors"
                  >
                    {news.title} ↗
                  </a>
                </h2>

                {/* User Memo */}
                {editingMemoId === news.id ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={memoInputs[news.id] ?? ""}
                      onChange={(e) =>
                        setMemoInputs((prev) => ({
                          ...prev,
                          [news.id]: e.target.value,
                        }))
                      }
                      placeholder="이 기사에 대한 내 한 줄 생각을 기록하세요..."
                      className="flex-1 rounded-xl border border-blue-300 dark:border-blue-800 bg-white dark:bg-zinc-950 px-3.5 py-2 text-xs sm:text-sm"
                    />
                    <button
                      onClick={() => handleSaveMemo(news)}
                      className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
                    >
                      저장
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 px-4 py-2.5 text-xs sm:text-sm text-blue-950 dark:text-blue-200">
                    💬 <strong>내 한 줄 생각:</strong>{" "}
                    {news.user_memo || (
                      <span className="text-zinc-400">
                        작성된 메모가 없습니다. [메모 수정]을 눌러 생각을 남겨보세요.
                      </span>
                    )}
                  </div>
                )}

                {summaryLines.length > 0 && (
                  <ul className="space-y-1 text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/40 p-3.5 rounded-xl">
                    {summaryLines.map((line, idx) => (
                      <li key={idx}>• {line}</li>
                    ))}
                  </ul>
                )}

                {news.ai_briefing?.so_what && (
                  <div className="text-xs sm:text-sm text-emerald-800 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/25 px-3.5 py-2.5 rounded-xl border border-emerald-200/60 dark:border-emerald-900/50">
                    💡 <strong>So What?</strong> {news.ai_briefing.so_what}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
