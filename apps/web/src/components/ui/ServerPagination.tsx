import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ServerPaginationProps {
  pathname: string;
  page: number;
  totalPages: number;
  query?: Record<string, string | number | undefined>;
}

function pageHref(pathname: string, page: number, query: ServerPaginationProps['query']) {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  if (page > 1) params.set('page', String(page));
  const value = params.toString();
  return value ? `${pathname}?${value}` : pathname;
}

export default function ServerPagination({ pathname, page, totalPages, query }: ServerPaginationProps) {
  if (totalPages <= 1) return null;

  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  const pages = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="페이지 이동">
      {currentPage > 1 && (
        <Link href={pageHref(pathname, currentPage - 1, query)} className="inline-flex h-10 items-center gap-1 rounded-md border border-border px-3 text-sm text-zinc-300 hover:border-accent-muted hover:text-white">
          <ChevronLeft className="h-4 w-4" /> 이전
        </Link>
      )}
      {pages.map((targetPage) => (
        <Link
          key={targetPage}
          href={pageHref(pathname, targetPage, query)}
          aria-current={targetPage === currentPage ? 'page' : undefined}
          className={`inline-flex h-10 min-w-10 items-center justify-center rounded-md border px-3 text-sm font-semibold ${
            targetPage === currentPage
              ? 'border-primary bg-primary text-white'
              : 'border-border text-zinc-400 hover:border-accent-muted hover:text-white'
          }`}
        >
          {targetPage}
        </Link>
      ))}
      {currentPage < totalPages && (
        <Link href={pageHref(pathname, currentPage + 1, query)} className="inline-flex h-10 items-center gap-1 rounded-md border border-border px-3 text-sm text-zinc-300 hover:border-accent-muted hover:text-white">
          다음 <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </nav>
  );
}
