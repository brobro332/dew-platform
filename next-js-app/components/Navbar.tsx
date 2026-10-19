"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fetchMyProfile, UserProfile } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/", label: "오늘의 주요뉴스", icon: "☀️" },
  { href: "/words", label: "나만의 단어사전", icon: "📕" },
  { href: "/scraps", label: "스크랩 보관함", icon: "📌" },
  { href: "/settings", label: "알림·케어 설정", icon: "⚙️" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchMyProfile()
      .then((data) => {
        if (mounted) setProfile(data);
      })
      .catch(() => {
        // 백엔드 미기동 시 조용히 무시
      });
    return () => {
      mounted = false;
    };
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 dark:border-zinc-800 bg-white/85 dark:bg-zinc-950/85 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-sm group-hover:scale-105 transition-transform">
            🌱
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight text-zinc-900 dark:text-zinc-100">
                Dew Platform
              </span>
              <span className="hidden sm:inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                AI Care
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 hidden sm:block">
              내 눈높이 뉴스 브리핑 & 나만의 AI 단어사전
            </p>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Profile & Stats Badge */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          {profile ? (
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-zinc-100/80 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 text-xs">
              <div className="flex flex-col text-right">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {profile.nickname}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {profile.email}
                </span>
              </div>
              <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-700" />
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-zinc-600 dark:text-zinc-400">
                  단어{" "}
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {profile.word_count}
                  </strong>
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">
                  스크랩{" "}
                  <strong className="text-blue-600 dark:text-blue-400">
                    {profile.scrap_count}
                  </strong>
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-zinc-400 px-2.5 py-1 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-800">
              로컬 개발 모드
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
