'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="hidden border-t border-border bg-background-secondary/60 md:block">
      <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="text-center md:text-left">
            <Link href="/" className="text-lg font-bold text-white">
              Novel<span className="text-accent">Verse</span>
            </Link>
            <p className="mt-2 text-sm text-zinc-500">
              읽기와 연재를 빠르게 오가는 웹소설 플랫폼
            </p>
          </div>

          <div className="flex items-center gap-8">
            <Link href="/novels" className="text-sm text-zinc-500 transition-colors hover:text-accent">
              작품 탐색
            </Link>
            <Link href="/rankings" className="text-sm text-zinc-500 transition-colors hover:text-accent">
              랭킹
            </Link>
            <Link href="/dashboard" className="text-sm text-zinc-500 transition-colors hover:text-accent">
              작가센터
            </Link>
            <Link href="/terms" className="text-sm text-zinc-500 transition-colors hover:text-accent">
              이용약관
            </Link>
            <Link href="/privacy" className="text-sm text-zinc-500 transition-colors hover:text-accent">
              개인정보
            </Link>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <p className="text-center text-xs text-zinc-600">
            &copy; {new Date().getFullYear()} NovelVerse. 모든 권리를 보유합니다.
          </p>
        </div>
      </div>
    </footer>
  );
}
