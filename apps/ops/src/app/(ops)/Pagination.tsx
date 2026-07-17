import Link from 'next/link';

type PaginationProps = {
  page: number;
  totalPages: number;
  pathname: string;
  query?: Record<string, string | undefined>;
};

function buildHref(
  pathname: string,
  page: number,
  query: Record<string, string | undefined>
) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) searchParams.set(key, value);
  }
  if (page > 1) searchParams.set('page', String(page));
  const queryString = searchParams.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export default function Pagination({
  page,
  totalPages,
  pathname,
  query = {},
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className="mt-5 flex items-center justify-center gap-3 text-sm" aria-label="페이지 이동">
      {page > 1 ? (
        <Link
          href={buildHref(pathname, page - 1, query)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-muted hover:text-foreground"
        >
          이전
        </Link>
      ) : (
        <span className="rounded-md border border-border px-3 py-2 text-muted opacity-40">이전</span>
      )}
      <span className="text-muted">
        {page.toLocaleString()} / {totalPages.toLocaleString()}
      </span>
      {page < totalPages ? (
        <Link
          href={buildHref(pathname, page + 1, query)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-muted hover:text-foreground"
        >
          다음
        </Link>
      ) : (
        <span className="rounded-md border border-border px-3 py-2 text-muted opacity-40">다음</span>
      )}
    </nav>
  );
}
