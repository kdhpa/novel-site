'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('NovelVerse route error', error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-lg rounded-lg border border-border bg-background-secondary p-8 text-center shadow-xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-300">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-white">페이지를 불러오지 못했습니다</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          일시적인 연결 문제일 수 있습니다. 잠시 후 다시 시도해 주세요.
        </p>
        {error.digest && <p className="mt-2 text-xs text-zinc-600">오류 참조: {error.digest}</p>}
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> 다시 시도
          </button>
          <Link href="/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-5 text-sm font-semibold text-zinc-300 hover:bg-background-tertiary hover:text-white">
            <Home className="h-4 w-4" aria-hidden="true" /> 홈으로
          </Link>
        </div>
      </div>
    </main>
  );
}
