"use client";

import React, { useEffect, useState } from "react";
import {
  CareSetting,
  fetchCareSettings,
  fetchMyProfile,
  sendTestDiscordNotification,
  STANDARD_NEWS_CATEGORIES,
  updateCareSettings,
  UserProfile,
} from "@/lib/api";

export default function CareSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [activeCategories, setActiveCategories] = useState<string[]>(
    STANDARD_NEWS_CATEGORIES.map((c) => c.key)
  );
  const [dailyCronTime, setDailyCronTime] = useState<string>("07:30");
  const [weeklyRemindEnabled, setWeeklyRemindEnabled] = useState<boolean>(true);
  const [isActive, setIsActive] = useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testingWebhook, setTestingWebhook] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [prof, setting] = await Promise.all([
          fetchMyProfile(),
          fetchCareSettings(),
        ]);
        setProfile(prof);
        applySettingState(setting);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "설정 정보를 불러오지 못했습니다.";
        setErrorMsg(message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const applySettingState = (s: CareSetting) => {
    setWebhookUrl(s.discord_webhook_url || "");
    setActiveCategories(
      s.active_categories && s.active_categories.length > 0
        ? s.active_categories
        : STANDARD_NEWS_CATEGORIES.map((c) => c.key)
    );
    setDailyCronTime(s.daily_cron_time || "07:30");
    setWeeklyRemindEnabled(s.weekly_remind_enabled ?? true);
    setIsActive(s.is_active ?? true);
  };

  const toggleCategory = (catKey: string) => {
    setActiveCategories((prev) =>
      prev.includes(catKey)
        ? prev.filter((c) => c !== catKey)
        : [...prev, catKey]
    );
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      const updated = await updateCareSettings({
        discord_webhook_url: webhookUrl.trim() || null,
        active_categories: activeCategories,
        daily_cron_time: dailyCronTime,
        weekly_remind_enabled: weeklyRemindEnabled,
        is_active: isActive,
      });
      applySettingState(updated);
      showToast("✅ 알림 및 케어 설정이 성공적으로 저장되었습니다.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "설정 저장에 실패했습니다.";
      setErrorMsg(message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestDiscord = async () => {
    setTestingWebhook(true);
    setErrorMsg(null);
    try {
      // 먼저 현재 입력된 웹훅 URL 저장
      if (webhookUrl.trim()) {
        await updateCareSettings({
          discord_webhook_url: webhookUrl.trim(),
          active_categories: activeCategories,
          daily_cron_time: dailyCronTime,
          weekly_remind_enabled: weeklyRemindEnabled,
          is_active: isActive,
        });
      }
      const res = await sendTestDiscordNotification();
      showToast(
        `🚀 내 디스코드 채널로 브리핑 알림(${res.target_date})이 즉시 발송되었습니다! 휴대폰 디스코드를 확인해 보세요.`
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "디스코드 테스트 발송에 실패했습니다.";
      setErrorMsg(message);
    } finally {
      setTestingWebhook(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md rounded-2xl bg-zinc-900 dark:bg-emerald-950 text-white px-4 py-3 text-sm font-medium shadow-xl border border-zinc-700">
          {toastMsg}
        </div>
      )}

      {/* User Account Card (Cloudflare Zero Trust JIT Profile) */}
      <section className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              🔐 Cloudflare Zero Trust 무가입 자동 인증 계정
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
              내 프로필 및 디스코드 알림 설정
            </h1>
          </div>
          {profile && (
            <span className="px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              User #{profile.id}
            </span>
          )}
        </div>

        {profile && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-3.5 border border-zinc-200/60 dark:border-zinc-800">
              <div className="text-xs text-zinc-500">인증 이메일</div>
              <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">
                {profile.email}
              </div>
            </div>
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-3.5 border border-zinc-200/60 dark:border-zinc-800">
              <div className="text-xs text-zinc-500">내 단어사전 누적 단어</div>
              <div className="font-bold text-base text-emerald-600 dark:text-emerald-400 mt-0.5">
                {profile.word_count}개
              </div>
            </div>
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-3.5 border border-zinc-200/60 dark:border-zinc-800">
              <div className="text-xs text-zinc-500">영구 스크랩 뉴스</div>
              <div className="font-bold text-base text-blue-600 dark:text-blue-400 mt-0.5">
                {profile.scrap_count}건
              </div>
            </div>
          </div>
        )}
      </section>

      {errorMsg && (
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Care Setting Form */}
      <form
        onSubmit={handleSaveSettings}
        className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 shadow-2xs space-y-6"
      >
        {loading ? (
          <div className="h-64 animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
        ) : (
          <>
            {/* Master Toggle */}
            <div className="flex items-center justify-between pb-5 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h2 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                  🔔 모닝 브리핑 휴대폰 푸시 알림 활성화
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  매일 지정한 시각에 내 디스코드 채널로 분야별 Top 3 뉴스 카드와
                  핵심 용어를 발송합니다.
                </p>
              </div>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-5 h-5 accent-emerald-600 cursor-pointer"
              />
            </div>

            {/* Discord Webhook URL */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-zinc-800 dark:text-zinc-200">
                📱 개인 디스코드 웹훅 URL (Discord Webhook)
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-xs text-zinc-500 leading-relaxed">
                💡 디스코드 서버 &rarr; 채널 편집 &rarr; <strong>연동(Integrations)</strong>{" "}
                &rarr; <strong>웹후크(Webhooks)</strong>에서 새 웹후크를 만들고{" "}
                <strong>웹후크 URL 복사</strong>를 붙여넣으세요.
              </p>
            </div>

            {/* Active Categories */}
            <div className="space-y-2.5">
              <label className="block text-sm font-bold text-zinc-800 dark:text-zinc-200">
                📊 디스코드로 수신할 관심 뉴스 분야 선택 (1분야 = 1 Embed 카드)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {STANDARD_NEWS_CATEGORIES.map((cat) => {
                  const checked = activeCategories.includes(cat.key);
                  return (
                    <label
                      key={cat.key}
                      className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition ${
                        checked
                          ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30"
                          : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <span>{cat.icon}</span>
                        <span>{cat.label}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(cat.key)}
                        className="w-4 h-4 accent-emerald-600"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Schedule Time & Weekly Remind */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-zinc-800 dark:text-zinc-200">
                  ⏰ 매일 아침 알림 수신 시각 (KST)
                </label>
                <input
                  type="time"
                  value={dailyCronTime}
                  onChange={(e) => setDailyCronTime(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-zinc-500">
                  서버는 매일 06:50(KST)에 공통 주요뉴스 15건을 사전 수집합니다.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-zinc-800 dark:text-zinc-200">
                  🗓️ 주간 지식 복습 리마인드 (Weekly Care)
                </label>
                <label className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 cursor-pointer">
                  <span className="text-xs text-zinc-700 dark:text-zinc-300">
                    매주 주말 이번 주 등록 단어·스크랩 뉴스 리마인드 받기
                  </span>
                  <input
                    type="checkbox"
                    checked={weeklyRemindEnabled}
                    onChange={(e) => setWeeklyRemindEnabled(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600"
                  />
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                disabled={testingWebhook || !webhookUrl.trim()}
                onClick={handleTestDiscord}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs sm:text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition cursor-pointer"
              >
                {testingWebhook
                  ? "⏳ 디스코드 발송 중..."
                  : "🚀 내 디스코드로 테스트 브리핑 즉시 발송"}
              </button>

              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-xs sm:text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 transition cursor-pointer"
              >
                {saving ? "저장 중..." : "💾 설정 저장하기"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
