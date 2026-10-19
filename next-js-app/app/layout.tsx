import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dew Platform — AI 지식·인사이트 케어 파트너",
  description:
    "오늘 알아야 할 5대 분야 주요뉴스를 내 눈높이로 소화하고, 나만의 AI 단어사전으로 정제하여 쌓아주는 개인 케어 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Suspense fallback={<div className="h-16 border-b border-zinc-200 dark:border-zinc-800" />}>
          <Navbar />
        </Suspense>
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
        <footer className="border-t border-zinc-200/70 dark:border-zinc-800/70 py-6 text-center text-xs text-zinc-500">
          🌱 Dew Platform — 공식 RSS 기반 AI 눈높이 뉴스 브리핑 & 나만의 단어사전 케어 비서
        </footer>
      </body>
    </html>
  );
}
