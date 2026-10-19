"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  createCategory,
  createWord,
  deleteWord,
  fetchCategories,
  fetchWords,
  previewWordWithAI,
  updateWord,
  WordCategory,
  WordEntry,
  WordPreviewResponse,
} from "@/lib/api";

const PRESET_COLORS = [
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#8B5CF6", // Purple
  "#F59E0B", // Amber
  "#EF4444", // Rose
  "#06B6D4", // Cyan
];

export default function VocabularyVaultPage() {
  const [categories, setCategories] = useState<WordCategory[]>([]);
  const [words, setWords] = useState<WordEntry[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [memorizedFilter, setMemorizedFilter] = useState<
    "all" | "learning" | "memorized"
  >("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 새 카테고리 생성 폼 상태
  const [showNewCatForm, setShowNewCatForm] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>("");
  const [newCatColor, setNewCatColor] = useState<string>(PRESET_COLORS[0]);

  // 단어 등록 & AI 보정 워크플로우 상태
  const [termInput, setTermInput] = useState<string>("");
  const [userDefInput, setUserDefInput] = useState<string>("");
  const [formCategoryId, setFormCategoryId] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [aiPreview, setAiPreview] = useState<WordPreviewResponse | null>(null);
  const [savingWord, setSavingWord] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const loadVaultData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const isMemParam =
        memorizedFilter === "all"
          ? null
          : memorizedFilter === "memorized"
          ? true
          : false;

      const [catList, wordList] = await Promise.all([
        fetchCategories(),
        fetchWords({
          category_id: selectedCategoryId,
          q: searchQuery,
          is_memorized: isMemParam,
        }),
      ]);
      setCategories(catList);
      setWords(wordList);
      if (formCategoryId === null && catList.length > 0) {
        setFormCategoryId(catList[0].id);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "단어사전 데이터를 불러오지 못했습니다.";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  }, [selectedCategoryId, searchQuery, memorizedFilter, formCategoryId]);

  useEffect(() => {
    loadVaultData();
  }, [loadVaultData]);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      const created = await createCategory({
        name: newCatName.trim(),
        color_code: newCatColor,
      });
      setCategories((prev) => [...prev, created]);
      if (formCategoryId === null) setFormCategoryId(created.id);
      setNewCatName("");
      setShowNewCatForm(false);
      showToast(`📁 '${created.name}' 카테고리가 생성되었습니다.`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "카테고리 생성에 실패했습니다.";
      setErrorMsg(message);
    }
  };

  const handlePreviewAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termInput.trim()) return;
    setPreviewLoading(true);
    setErrorMsg(null);
    try {
      const preview = await previewWordWithAI({
        term: termInput.trim(),
        user_definition: userDefInput.trim() || undefined,
      });
      setAiPreview(preview);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "AI 보정 미리보기에 실패했습니다.";
      setErrorMsg(message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSaveWord = async (mode: "ai_replace" | "merge_both" | "raw") => {
    if (!termInput.trim()) return;
    setSavingWord(true);
    setErrorMsg(null);
    try {
      const userMemoToSave =
        mode === "ai_replace" && aiPreview
          ? aiPreview.corrected_user_memo
          : userDefInput.trim() || null;

      const aiRefinedToSave = aiPreview
        ? aiPreview.ai_refined_definition
        : null;

      await createWord({
        category_id: formCategoryId,
        term: termInput.trim(),
        user_definition: userMemoToSave,
        ai_refined_definition: aiRefinedToSave,
        ai_supplement: aiPreview
          ? {
              one_line_definition: aiPreview.one_line_definition,
              corrected_user_memo: aiPreview.corrected_user_memo,
              examples: aiPreview.examples,
              related_keywords: aiPreview.related_keywords,
              opposite_keywords: aiPreview.opposite_keywords,
            }
          : {},
      });

      showToast(`📕 '${termInput.trim()}' 단어가 내 단어사전에 저장되었습니다!`);
      setTermInput("");
      setUserDefInput("");
      setAiPreview(null);
      await loadVaultData();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "단어 저장에 실패했습니다.";
      setErrorMsg(message);
    } finally {
      setSavingWord(false);
    }
  };

  const handleToggleMemorized = async (word: WordEntry) => {
    try {
      const updated = await updateWord(word.id, {
        is_memorized: !word.is_memorized,
      });
      setWords((prev) =>
        prev.map((w) => (w.id === word.id ? updated : w))
      );
      showToast(
        updated.is_memorized
          ? `✅ '${word.term}' 단어를 숙지 완료로 표시했습니다.`
          : `'${word.term}' 단어를 학습 중 상태로 변경했습니다.`
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "상태 변경에 실패했습니다.";
      setErrorMsg(message);
    }
  };

  const handleDeleteWord = async (word: WordEntry) => {
    try {
      await deleteWord(word.id);
      setWords((prev) => prev.filter((w) => w.id !== word.id));
      showToast(`🗑️ '${word.term}' 단어가 삭제되었습니다.`);
      await loadVaultData();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "단어 삭제에 실패했습니다.";
      setErrorMsg(message);
    }
  };

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md rounded-2xl bg-zinc-900 dark:bg-emerald-950 text-white px-4 py-3 text-sm font-medium shadow-xl border border-zinc-700 dark:border-emerald-700">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <section className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold border border-emerald-200 dark:border-emerald-800">
              📕 Custom AI Vocabulary Vault
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              나만의 AI 단어사전
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              내가 대략 이해한 뜻이나 메모를 적으면 AI가 사전 수준으로 교정하고
              실전 예문과 연관 키워드를 채워줍니다. 등록된 단어는 매일 아침
              주요뉴스에 등장할 때 자동으로 형광펜 하이라이트됩니다.
            </p>
          </div>
        </div>

        {/* Word Registration & AI Refinement Form */}
        <form
          onSubmit={handlePreviewAI}
          className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                카테고리 폴더
              </label>
              <select
                value={formCategoryId ?? ""}
                onChange={(e) =>
                  setFormCategoryId(
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    📁 {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                단어 / 용어명 (필수)
              </label>
              <input
                type="text"
                required
                value={termInput}
                onChange={(e) => setTermInput(e.target.value)}
                placeholder="예: 양적완화, 디커플링, RAG"
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-6">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                내가 이해한 뜻 / 초안 메모 (선택 — 오개념이 있어도 AI가 교정해 줍니다)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userDefInput}
                  onChange={(e) => setUserDefInput(e.target.value)}
                  placeholder="예: 중앙은행이 시중에 돈을 풀어서 경기를 부양하는 정책?"
                  className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={previewLoading || !termInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-60 transition shrink-0 cursor-pointer"
                >
                  {previewLoading ? "✨ AI 분석 중..." : "✨ AI 내용 보정"}
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Before / After AI Comparison View */}
        {aiPreview && (
          <div className="mt-5 rounded-2xl border-2 border-emerald-500/70 bg-emerald-50/40 dark:bg-emerald-950/20 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">✨</span>
                <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                  AI 내용 보정 비교 (Before vs After) —{" "}
                  <span className="text-emerald-700 dark:text-emerald-300">
                    {aiPreview.term}
                  </span>
                </h3>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-medium">
                엔진: {aiPreview.engine_used}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Before: User Draft */}
              <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 space-y-2">
                <div className="text-xs font-bold text-zinc-400 uppercase">
                  📝 BEFORE (내가 입력한 초안)
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {aiPreview.user_definition ||
                    "(초안 메모 없이 단어명만 입력됨)"}
                </p>
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                    🔧 내 메모 교정 코멘트
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    {aiPreview.corrected_user_memo}
                  </p>
                </div>
              </div>

              {/* After: AI Refined */}
              <div className="rounded-xl bg-white dark:bg-zinc-900 border border-emerald-300 dark:border-emerald-800 p-4 space-y-2.5">
                <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                  🌟 AFTER (AI 정제 정의 & 예문)
                </div>
                <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  💡 한 줄 정의: {aiPreview.one_line_definition}
                </div>
                <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {aiPreview.ai_refined_definition}
                </p>

                {aiPreview.examples?.length > 0 && (
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-1">
                    <div className="text-xs font-semibold text-zinc-500">
                      🗣️ 실전 활용 예문
                    </div>
                    {aiPreview.examples.map((ex, i) => (
                      <p
                        key={i}
                        className="text-xs text-zinc-600 dark:text-zinc-400 italic"
                      >
                        • &ldquo;{ex}&rdquo;
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {aiPreview.related_keywords?.map((kw, i) => (
                    <span
                      key={`rel-${i}`}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                    >
                      🔗 연관: {kw}
                    </span>
                  ))}
                  {aiPreview.opposite_keywords?.map((kw, i) => (
                    <span
                      key={`opp-${i}`}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                    >
                      ↔️ 반대: {kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setAiPreview(null)}
                className="px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                disabled={savingWord}
                onClick={() => handleSaveWord("merge_both")}
                className="px-4 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold hover:opacity-90 cursor-pointer"
              >
                내 원본 초안 + AI 보정본 함께 병합 저장
              </button>
              <button
                type="button"
                disabled={savingWord}
                onClick={() => handleSaveWord("ai_replace")}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-xs cursor-pointer"
              >
                ✨ AI 교정본으로 깔끔하게 저장 (추천)
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Category Bar + Search & Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategoryId(null)}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer whitespace-nowrap ${
              selectedCategoryId === null
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800"
            }`}
          >
            전체 폴더 (
            {categories.reduce((acc, c) => acc + c.word_count, 0)})
          </button>

          {categories.map((cat) => {
            const active = selectedCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                  active
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100"
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color_code }}
                />
                <span>{cat.name}</span>
                <span
                  className={`text-xs px-1.5 py-0.2 rounded-full ${
                    active
                      ? "bg-white/20 text-white"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {cat.word_count}
                </span>
              </button>
            );
          })}

          <button
            onClick={() => setShowNewCatForm(!showNewCatForm)}
            className="px-3 py-2 rounded-xl text-xs font-semibold border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-emerald-600 hover:border-emerald-500 whitespace-nowrap cursor-pointer"
          >
            + 새 폴더
          </button>
        </div>

        {/* Search & Memorized Filter */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="단어명 또는 뜻 검색..."
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <select
            value={memorizedFilter}
            onChange={(e) =>
              setMemorizedFilter(
                e.target.value as "all" | "learning" | "memorized"
              )
            }
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs sm:text-sm focus:outline-none"
          >
            <option value="all">전체 상태</option>
            <option value="learning">📖 학습 중</option>
            <option value="memorized">✅ 숙지 완료</option>
          </select>
        </div>
      </div>

      {/* New Category Form */}
      {showNewCatForm && (
        <form
          onSubmit={handleCreateCategory}
          className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 flex flex-wrap items-center gap-3"
        >
          <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
            새 카테고리 폴더 추가:
          </span>
          <input
            type="text"
            required
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="폴더 이름 (예: 반도체/AI, 부동산)"
            className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-xs sm:text-sm"
          />
          <div className="flex items-center gap-1.5">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNewCatColor(color)}
                className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                  newCatColor === color
                    ? "scale-125 ring-2 ring-offset-2 ring-zinc-400"
                    : ""
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <button
            type="submit"
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
          >
            추가
          </button>
        </form>
      )}

      {errorMsg && (
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Words Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-48 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 animate-pulse"
            />
          ))}
        </div>
      ) : words.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center space-y-2">
          <div className="text-3xl">📕</div>
          <h3 className="font-bold text-base text-zinc-800 dark:text-zinc-100">
            등록된 단어가 없습니다
          </h3>
          <p className="text-xs sm:text-sm text-zinc-500">
            위 입력창에서 새 용어를 AI로 보정해 등록하거나, 오늘의 주요뉴스에서
            핵심 용어를 원클릭으로 추가해 보세요!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {words.map((word) => {
            const cat = word.category_id
              ? categoryMap.get(word.category_id)
              : undefined;
            const supplement = word.ai_supplement || {};

            return (
              <div
                key={word.id}
                className={`rounded-2xl bg-white dark:bg-zinc-900 border p-5 shadow-2xs flex flex-col justify-between gap-4 transition ${
                  word.is_memorized
                    ? "border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/10"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="space-y-3">
                  {/* Top Bar */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        {word.term}
                      </h3>
                      {cat && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                          style={{ backgroundColor: cat.color_code }}
                        >
                          {cat.name}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleToggleMemorized(word)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          word.is_memorized
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                        }`}
                      >
                        {word.is_memorized ? "✅ 숙지 완료" : "📖 학습 중"}
                      </button>
                      <button
                        onClick={() => handleDeleteWord(word)}
                        title="단어 삭제"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs cursor-pointer"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* One-line Definition */}
                  {supplement.one_line_definition && (
                    <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-lg">
                      💡 {supplement.one_line_definition}
                    </div>
                  )}

                  {/* AI Refined Definition */}
                  {word.ai_refined_definition && (
                    <p className="text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed">
                      {word.ai_refined_definition}
                    </p>
                  )}

                  {/* User Memo */}
                  {word.user_definition && (
                    <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-800">
                      📝 <strong>내 메모:</strong> {word.user_definition}
                    </div>
                  )}

                  {/* Examples */}
                  {supplement.examples && supplement.examples.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="text-[11px] font-bold text-zinc-400">
                        실전 활용 예문
                      </div>
                      {supplement.examples.map((ex, idx) => (
                        <p
                          key={idx}
                          className="text-xs text-zinc-600 dark:text-zinc-400 italic"
                        >
                          • &ldquo;{ex}&rdquo;
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Keywords */}
                  {((supplement.related_keywords &&
                    supplement.related_keywords.length > 0) ||
                    (supplement.opposite_keywords &&
                      supplement.opposite_keywords.length > 0)) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {supplement.related_keywords?.map((kw, i) => (
                        <span
                          key={`r-${i}`}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                        >
                          🔗 {kw}
                        </span>
                      ))}
                      {supplement.opposite_keywords?.map((kw, i) => (
                        <span
                          key={`o-${i}`}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                        >
                          ↔️ {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Source News Snapshot Footer */}
                {word.source_news_title && (
                  <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 text-xs flex items-center justify-between gap-2 text-zinc-500">
                    <span className="truncate">
                      📰 출처 뉴스:{" "}
                      {word.source_news_url ? (
                        <a
                          href={word.source_news_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-700 dark:text-zinc-300 hover:text-emerald-600 underline"
                        >
                          {word.source_news_title}
                        </a>
                      ) : (
                        word.source_news_title
                      )}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
