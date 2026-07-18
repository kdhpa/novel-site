import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { auth } from '@/lib/auth';
import LibraryTabs from '@/components/library/LibraryTabs';
import LibraryNovelCard from '@/components/library/LibraryNovelCard';
import { getLibraryData } from '@/app/api/library/data';
import {
  LIBRARY_PAGE_SIZE,
  normalizeLibraryPage,
  normalizeLibraryTab,
  type LibraryPagination,
  type LibraryTab,
} from '@/components/library/types';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '내 서재',
  description: '이어보기, 북마크, 좋아요, 리뷰한 작품을 관리합니다.',
};

interface PageProps {
  searchParams: Promise<{ tab?: string; page?: string }>;
}

const emptyMessages: Record<LibraryTab, string> = {
  history: '아직 읽은 작품이 없습니다.',
  bookmarks: '북마크한 작품이 없습니다.',
  likes: '좋아요한 작품이 없습니다.',
  reviews: '작성한 리뷰가 없습니다.',
};

function libraryHref(tab: LibraryTab, page: number) {
  const params = new URLSearchParams({ tab });
  if (page > 1) params.set('page', String(page));
  return `/library?${params.toString()}`;
}

function LibraryPaginationNav({ tab, pagination }: { tab: LibraryTab; pagination: LibraryPagination }) {
  if (pagination.totalPages <= 1) return null;

  return (
    <nav className="mt-6 flex items-center justify-center gap-3" aria-label="서재 페이지 이동">
      {pagination.hasPreviousPage ? (
        <Link href={libraryHref(tab, pagination.page - 1)} className="rounded-md border border-border bg-background-secondary px-4 py-2 text-sm text-zinc-300 hover:border-accent-muted hover:text-white">
          이전
        </Link>
      ) : (
        <span className="rounded-md border border-border px-4 py-2 text-sm text-zinc-600">이전</span>
      )}
      <span className="text-sm text-zinc-500">
        {pagination.page.toLocaleString()} / {pagination.totalPages.toLocaleString()}
      </span>
      {pagination.hasNextPage ? (
        <Link href={libraryHref(tab, pagination.page + 1)} className="rounded-md border border-border bg-background-secondary px-4 py-2 text-sm text-zinc-300 hover:border-accent-muted hover:text-white">
          다음
        </Link>
      ) : (
        <span className="rounded-md border border-border px-4 py-2 text-sm text-zinc-600">다음</span>
      )}
    </nav>
  );
}

export default async function LibraryPage({ searchParams }: PageProps) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  const tab = normalizeLibraryTab(params.tab);
  const page = normalizeLibraryPage(params.page);

  if (!session?.user?.id) {
    const callbackUrl = libraryHref(tab, page);
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const data = await getLibraryData(session.user.id, tab, page, LIBRARY_PAGE_SIZE);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 border-b border-border pb-5">
        <p className="mb-2 text-sm font-semibold text-accent">서재</p>
        <h1 className="text-3xl font-bold text-white">내 서재</h1>
        <p className="mt-1 text-sm text-zinc-500">이어보기, 북마크, 좋아요, 리뷰한 작품을 한곳에서 관리합니다.</p>
      </div>

      <LibraryTabs activeTab={tab} />
      {data.items.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-background-secondary text-center">
          <BookOpen className="mb-4 h-14 w-14 text-zinc-600" />
          <p className="text-zinc-300">{emptyMessages[tab]}</p>
          <p className="mt-1 text-sm text-zinc-500">작품을 둘러보고 내 서재를 채워보세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map((item) => <LibraryNovelCard key={item.id} item={item} tab={tab} />)}
        </div>
      )}
      <LibraryPaginationNav tab={tab} pagination={data.pagination} />
    </div>
  );
}
