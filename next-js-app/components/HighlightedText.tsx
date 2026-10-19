"use client";

import React from "react";
import { MatchedWordHighlight } from "@/lib/api";

interface HighlightedTextProps {
  text: string;
  matchedWords?: MatchedWordHighlight[];
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function HighlightedText({
  text,
  matchedWords = [],
}: HighlightedTextProps) {
  if (!text) return null;
  if (!matchedWords || matchedWords.length === 0) {
    return <>{text}</>;
  }

  // 긴 단어부터 매칭되도록 정렬
  const sortedWords = [...matchedWords]
    .filter((w) => w.term && w.term.trim().length >= 2)
    .sort((a, b) => b.term.length - a.term.length);

  if (sortedWords.length === 0) {
    return <>{text}</>;
  }

  const pattern = new RegExp(
    `(${sortedWords.map((w) => escapeRegExp(w.term.trim())).join("|")})`,
    "gi"
  );
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, idx) => {
        const matched = sortedWords.find(
          (w) => w.term.trim().toLowerCase() === part.toLowerCase()
        );
        if (!matched) {
          return <React.Fragment key={idx}>{part}</React.Fragment>;
        }
        return (
          <span key={idx} className="relative inline-block group cursor-help">
            <mark className="bg-amber-200/90 dark:bg-amber-500/30 text-amber-950 dark:text-amber-100 px-1 py-0.5 rounded font-semibold border-b-2 border-amber-400 transition-colors">
              {part}
            </mark>
            <span className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 z-50 rounded-xl bg-zinc-900 dark:bg-zinc-800 text-white text-xs p-3 shadow-xl border border-zinc-700">
              <span className="flex items-center justify-between gap-2 mb-1">
                <strong className="text-amber-300 font-bold text-sm">
                  📕 {matched.term}
                </strong>
                {matched.category_name && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-200">
                    {matched.category_name}
                  </span>
                )}
              </span>
              <span className="block text-zinc-200 leading-relaxed">
                {matched.definition}
              </span>
              <span className="block mt-1.5 text-[10px] text-emerald-400">
                ✨ 내 단어사전에 등록된 개념입니다
              </span>
            </span>
          </span>
        );
      })}
    </>
  );
}
