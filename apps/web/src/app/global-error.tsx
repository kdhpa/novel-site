'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('NovelVerse global error', error);
  }, [error]);

  return (
    <html lang="ko">
      <body className="bg-[#111315] text-white">
        <main className="flex min-h-screen items-center justify-center px-4 py-16">
          <div className="w-full max-w-lg rounded-lg border border-white/10 bg-[#181b1d] p-8 text-center shadow-2xl">
            <p className="text-sm font-semibold text-[#6fc7bd]">NovelVerse</p>
            <h1 className="mt-3 text-2xl font-bold">서비스를 표시하지 못했습니다</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400">페이지를 다시 불러오거나 잠시 후 재시도해 주세요.</p>
            {error.digest && <p className="mt-2 text-xs text-zinc-600">오류 참조: {error.digest}</p>}
            <button
              type="button"
              onClick={reset}
              className="mt-7 min-h-11 rounded-md bg-[#2f9d8f] px-6 text-sm font-semibold text-white hover:bg-[#278a7e] focus:outline-none focus:ring-2 focus:ring-[#6fc7bd]"
            >
              다시 시도
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
