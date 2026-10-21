"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import HighlightedText from "@/components/HighlightedText";
import {
  addNewsTermToVocabulary,
  DailyNewsItem,
  ExtractedTerm,
  fetchCategories,
  fetchDailyNews,
  STANDARD_NEWS_CATEGORIES,
  toggleNewsScrap,
  triggerNewsCollection,
  WordCategory,
} from "@/lib/api";

export default function DailyNewsDashboardPage() {
  const [newsList, setNewsList] = useState<DailyNewsItem[]>([]);
  const [categories, setCategories] = useState<WordCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("전체");
  const [targetDate, setTargetDate] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [collecting, setCollecting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 뉴스별 한 줄 메모 입력 상태
  const [memoInputs, setMemoInputs] = useState<Record<number, string>>({});
  const [openMemoId, setOpenMemoId] = useState<number | null>(null);

  // 원클릭 단어 추가 진행 상태
  const [addingTermKey, setAddingTermKey] = useState<string | null>(null);
  const [addedTermKeys, setAddedTermKeys] = useState<Record<string, boolean>>(
    {}
  );
  const [selectedWordCategoryId, setSelectedWordCategoryId] = useState<
    number | undefined
  >(undefined);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const loadData = useCallback(async (dateFilter?: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [newsData, catData] = await Promise.all([
        fetchDailyNews({
          target_date: dateFilter || undefined,
        }),
        fetchCategories().catch(() => []),
      ]);
      setNewsList(newsData);
      setCategories(catData);
      if (catData.length > 0) {
        setSelectedWordCategoryId((prev) =>
          prev === undefined ? catData[0].id : prev
        );
      }
      if (dateFilter) {
        setTargetDate(dateFilter);
      } else if (newsData.length > 0) {
        setTargetDate(newsData[0].briefing_date);
      } else {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        setTargetDate(`${yyyy}-${mm}-${dd}`);
      }
      const initialMemos: Record<number, string> = {};
      newsData.forEach((n) => {
        if (n.user_memo) initialMemos[n.id] = n.user_memo;
      });
      setMemoInputs(initialMemos);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "백엔드 서버와 연결할 수 없습니다.";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleManualCollect = async () => {
    setCollecting(true);
    setErrorMsg(null);
    try {
      const requestedDate = targetDate || undefined;
      const res = await triggerNewsCollection(requestedDate);
      const effectiveDate = requestedDate || res.briefing_date;
      showToast(
        `✅ 공식 RSS 수집 및 AI 눈높이 브리핑 생성 완료! (${effectiveDate}, ${res.collected_count}건)`
      );
      setTargetDate(effectiveDate);
      await loadData(effectiveDate);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "뉴스 수집 중 오류가 발생했습니다.";
      setErrorMsg(message);
    } finally {
      setCollecting(false);
    }
  };

  const handleToggleScrap = async (news: DailyNewsItem, customMemo?: string) => {
    try {
      const res = await toggleNewsScrap(news.id, customMemo);
      setNewsList((prev) =>
        prev.map((item) =>
          item.id === news.id
            ? {
                ...item,
                is_scrapped: res.is_scrapped,
                user_memo: res.user_memo,
              }
            : item
        )
      );
      if (res.is_scrapped) {
        showToast("📌 영구 보관함에 뉴스가 스크랩되었습니다.");
      } else {
        showToast("스크랩이 해제되었습니다.");
      }
      setOpenMemoId(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "스크랩 처리에 실패했습니다.";
      setErrorMsg(message);
    }
  };

  const handleAddTermToVault = async (
    news: DailyNewsItem,
    termItem: ExtractedTerm
  ) => {
    const key = `${news.id}-${termItem.term}`;
    setAddingTermKey(key);
    try {
      await addNewsTermToVocabulary(news.id, {
        term: termItem.term,
        definition: termItem.definition,
        category_id: selectedWordCategoryId ?? null,
      });
      setAddedTermKeys((prev) => ({ ...prev, [key]: true }));
      showToast(
        `📕 '${termItem.term}' 단어가 출처 스냅샷 및 AI 보정본과 함께 단어사전에 추가되었습니다!`
      );
      // 형광펜 매칭 갱신을 위해 뉴스 목록 리로드
      await loadData(targetDate || undefined);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "단어사전 추가에 실패했습니다.";
      setErrorMsg(message);
    } finally {
      setAddingTermKey(null);
    }
  };

  const filteredNews =
    selectedCategory === "전체"
      ? newsList
      : newsList.filter((n) => n.category === selectedCategory);

  const totalMatchedWordsCount = newsList.reduce(
    (acc, n) => acc + (n.matched_words?.length || 0),
    0
  );

  const getCategoryMeta = (catName: string) =>
    STANDARD_NEWS_CATEGORIES.find((c) => c.key === catName) || {
      key: catName,
      label: catName,
      icon: "📰",
      badgeClass:
        "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
    };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md rounded-2xl bg-zinc-900 dark:bg-emerald-950 text-white px-4 py-3 text-sm font-medium shadow-xl border border-zinc-700 dark:border-emerald-700 flex items-center gap-2 animate-fade-in">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Hero Banner */}
      <section className="rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-xs font-medium backdrop-blur-xs">
              <span>☀️ 모닝 인사이트 케어</span>
              <span>•</span>
              <span>5대 분야 × Top 3 엄선</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              오늘의 주요뉴스 & AI 눈높이 브리핑
            </h1>
            <p className="text-sm text-emerald-50/90 max-w-2xl leading-relaxed">
              매경·SBS·연합뉴스TV·한경 공식 RSS에서 엄선한 15건의 핵심 뉴스를{" "}
              <strong>3줄 요약</strong>과 <strong>So What(왜 중요할까?)</strong>{" "}
              해설로 3분 만에 소화하세요. 내 단어사전에 등록된 단어는 본문에{" "}
              <span className="bg-amber-300 text-zinc-900 px-1.5 py-0.5 rounded font-semibold">
                형광펜
              </span>
              으로 자동 표시됩니다.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 shrink-0">
            <button
              onClick={handleManualCollect}
              disabled={collecting}
              className="px-4 py-2.5 rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 disabled:opacity-60 font-semibold text-sm shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {collecting ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>RSS 수집 & AI 브리핑 생성 중...</span>
                </>
              ) : (
                <>
                  <span>🔄</span>
                  <span>지금 뉴스 수집 & AI 브리핑 생성</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-1.5 text-xs">
              <label htmlFor="briefing-date" className="text-emerald-100">
                브리핑 날짜:
              </label>
              <input
                id="briefing-date"
                type="date"
                value={targetDate}
                onChange={(e) => {
                  setTargetDate(e.target.value);
                  loadData(e.target.value);
                }}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Synergy Summary Bar */}
        <div className="mt-5 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-50">
          <div className="flex flex-wrap items-center gap-4">
            <span>
              📊 조회된 뉴스: <strong>{newsList.length}건</strong>
            </span>
            <span>
              ✨ 오늘 뉴스에 등장한 내 단어장 개념:{" "}
              <strong className="text-amber-300">
                {totalMatchedWordsCount}회
              </strong>
            </span>
          </div>
          {categories.length > 0 && (
            <div className="flex items-center gap-2">
              <span>원클릭 단어 저장 폴더:</span>
              <select
                value={selectedWordCategoryId ?? ""}
                onChange={(e) =>
                  setSelectedWordCategoryId(
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
                className="rounded-lg bg-white/20 text-white px-2 py-1 text-xs font-medium focus:outline-none"
              >
                {categories.map((cat) => (
                  <option
                    key={cat.id}
                    value={cat.id}
                    className="text-zinc-900"
                  >
                    📁 {cat.name} ({cat.word_count})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedCategory("전체")}
          className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer whitespace-nowrap ${
            selectedCategory === "전체"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
              : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100"
          }`}
        >
          전체 ({newsList.length})
        </button>
        {STANDARD_NEWS_CATEGORIES.map((cat) => {
          const count = newsList.filter((n) => n.category === cat.key).length;
          const active = selectedCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                active
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100"
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span
                className={`text-xs px-1.5 py-0.2 rounded-full ${
                  active
                    ? "bg-white/20 text-white"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-4">
          <div>
            <strong>⚠️ 알림:</strong> {errorMsg}
          </div>
          <button
            onClick={() => loadData(targetDate || undefined)}
            className="px-3 py-1 rounded-lg bg-red-100 dark:bg-red-900/60 text-xs font-semibold hover:bg-red-200 cursor-pointer shrink-0"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Loading or Empty State */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3].map((skeleton) => (
            <div
              key={skeleton}
              className="h-56 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 animate-pulse space-y-4"
            >
              <div className="h-5 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
              <div className="h-6 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded" />
              <div className="h-20 w-full bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />
            </div>
          ))}
        </div>
      ) : filteredNews.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center space-y-4">
          <div className="text-4xl">📰</div>
          <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
            아직 수집된 당일 주요뉴스 브리핑이 없습니다
          </h2>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            상단의 <strong>[지금 뉴스 수집 & AI 브리핑 생성]</strong> 버튼을
            누르면 4대 언론사 공식 RSS에서 5대 분야 주요뉴스를 즉시 수집하고 AI
            해설을 생성합니다.
          </p>
          <button
            onClick={handleManualCollect}
            disabled={collecting}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-60 transition cursor-pointer"
          >
            {collecting
              ? "⏳ 뉴스 수집 및 AI 분석 진행 중..."
              : "🔄 지금 첫 브리핑 생성하기"}
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredNews.map((news) => {
            const catMeta = getCategoryMeta(news.category);
            const summaryLines =
              news.ai_briefing?.three_line_summary &&
              news.ai_briefing.three_line_summary.length > 0
                ? news.ai_briefing.three_line_summary
                : news.summary_raw
                ? [news.summary_raw]
                : [];
            const soWhat = news.ai_briefing?.so_what;

            return (
              <article
                key={news.id}
                className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-5 sm:p-6 shadow-2xs hover:shadow-md transition-shadow space-y-4"
              >
                {/* Header: Category, Press, Matched Words, Scrap Button */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${catMeta.badgeClass}`}
                    >
                      <span>{catMeta.icon}</span>
                      <span>{catMeta.label}</span>
                    </span>
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
                      {news.press_name}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {news.briefing_date}
                    </span>
                    {news.matched_words && news.matched_words.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                        ✨ 내 단어장 단어 {news.matched_words.length}개 매칭
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setOpenMemoId(openMemoId === news.id ? null : news.id)
                      }
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      💬 메모
                    </button>
                    <button
                      onClick={() =>
                        handleToggleScrap(news, memoInputs[news.id])
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                        news.is_scrapped
                          ? "bg-blue-600 text-white shadow-2xs"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
                      }`}
                    >
                      <span>{news.is_scrapped ? "📌" : "📍"}</span>
                      <span>{news.is_scrapped ? "스크랩됨" : "영구 스크랩"}</span>
                    </button>
                  </div>
                </div>

                {/* News Title */}
                <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
                  <a
                    href={news.original_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                  >
                    <HighlightedText
                      text={news.title}
                      matchedWords={news.matched_words}
                    />
                  </a>
                  <a
                    href={news.original_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 inline-flex items-center text-xs font-normal text-zinc-400 hover:text-emerald-600"
                  >
                    [원문 보기 ↗]
                  </a>
                </h2>

                {/* 3-Line Summary */}
                {summaryLines.length > 0 && (
                  <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4 border border-zinc-200/60 dark:border-zinc-800 space-y-2">
                    <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      📝 3줄 핵심 요약
                    </div>
                    <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed">
                      {summaryLines.map((line, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold select-none">
                            •
                          </span>
                          <span>
                            <HighlightedText
                              text={line}
                              matchedWords={news.matched_words}
                            />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* So What? (왜 중요할까?) */}
                {soWhat && (
                  <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/60 p-4">
                    <div className="flex items-start gap-2.5">
                      <span className="text-lg shrink-0">💡</span>
                      <div className="space-y-1 text-sm">
                        <div className="font-bold text-emerald-900 dark:text-emerald-300">
                          왜 중요할까? (So What?)
                        </div>
                        <p className="text-emerald-950/90 dark:text-emerald-100/90 leading-relaxed">
                          <HighlightedText
                            text={soWhat}
                            matchedWords={news.matched_words}
                          />
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Extracted Key Terms & One-Click Add to Vocabulary */}
                {news.extracted_terms && news.extracted_terms.length > 0 && (
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                        📕 AI 핵심 용어 콕 집기 (원클릭 내 단어사전 연동)
                      </span>
                      <Link
                        href="/words"
                        className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                      >
                        내 단어사전 열기 →
                      </Link>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {news.extracted_terms.map((termObj, idx) => {
                        const key = `${news.id}-${termObj.term}`;
                        const alreadyMatched = news.matched_words?.some(
                          (m) =>
                            m.term.toLowerCase() ===
                            termObj.term.trim().toLowerCase()
                        );
                        const isAdded = addedTermKeys[key] || alreadyMatched;
                        const isAdding = addingTermKey === key;

                        return (
                          <div
                            key={idx}
                            className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-3"
                          >
                            <div className="space-y-0.5 text-xs">
                              <div className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                                {termObj.term}
                              </div>
                              <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                {termObj.definition}
                              </p>
                            </div>
                            <button
                              onClick={() =>
                                handleAddTermToVault(news, termObj)
                              }
                              disabled={isAdded || isAdding}
                              className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                                isAdded
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 cursor-default"
                                  : "bg-emerald-600 text-white hover:bg-emerald-700"
                              }`}
                            >
                              {isAdding
                                ? "보정 중..."
                                : isAdded
                                ? "✓ 등록됨"
                                : "+ 단어장 추가"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* User Scrap Memo Display or Input */}
                {(news.user_memo || openMemoId === news.id) && (
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    {openMemoId === news.id ? (
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
                          placeholder="이 뉴스에 대한 나만의 한 줄 생각이나 투자/업무 메모를 남겨보세요..."
                          className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          onClick={() =>
                            handleToggleScrap(news, memoInputs[news.id] ?? "")
                          }
                          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer shrink-0"
                        >
                          📌 메모와 함께 영구 스크랩
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 px-3.5 py-2 text-xs text-blue-900 dark:text-blue-200">
                        <span>
                          💬 <strong>내 한 줄 생각:</strong> {news.user_memo}
                        </span>
                        <button
                          onClick={() => setOpenMemoId(news.id)}
                          className="text-blue-600 dark:text-blue-400 hover:underline font-medium ml-2 cursor-pointer"
                        >
                          수정
                        </button>
                      </div>
                    )}
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
