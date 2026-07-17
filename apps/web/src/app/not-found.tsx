import Link from 'next/link';
import { BookOpen, Home, Search } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-background-secondary text-accent">
          <BookOpen className="h-8 w-8" aria-hidden="true" />
        </div>
        <p className="text-sm font-bold tracking-[0.2em] text-accent">404</p>
        <h1 className="mt-2 text-3xl font-bold text-white">페이지를 찾을 수 없습니다</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">주소가 바뀌었거나 공개되지 않은 작품·회차일 수 있습니다.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/novels" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover">
            <Search className="h-4 w-4" aria-hidden="true" /> 작품 찾기
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-5 text-sm font-semibold text-zinc-300 hover:bg-background-tertiary hover:text-white">
            <Home className="h-4 w-4" aria-hidden="true" /> 홈으로
          </Link>
        </div>
      </div>
    </main>
  );
}
