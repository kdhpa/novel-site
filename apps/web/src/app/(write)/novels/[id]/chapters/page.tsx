import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import Card from '@/components/ui/Card';
import ChapterList from '@/components/novel/ChapterList';
import type { Metadata } from 'next';
import ServerPagination from '@/components/ui/ServerPagination';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

const PAGE_SIZE = 30;

export const metadata: Metadata = {
  title: '회차 관리',
  description: '작품의 회차를 관리합니다.',
};

async function getNovelWithChapters(id: string, userId: string, page: number) {
  const novel = await prisma.novel.findFirst({
    where: {
      id,
      authorId: userId,
    },
    select: {
      title: true,
      _count: { select: { chapters: true } },
      chapters: {
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        orderBy: { chapterNumber: 'asc' },
        select: {
          id: true,
          chapterNumber: true,
          title: true,
          isPublished: true,
          publishedAt: true,
          createdAt: true,
          viewCount: true,
        },
      },
    },
  });

  return novel;
}

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1;
}

export default async function ChaptersManagementPage({ params, searchParams }: PageProps) {
  const [{ id }, session, query] = await Promise.all([params, auth(), searchParams]);

  if (!session?.user) {
    redirect('/login');
  }

  const page = parsePage(query.page);
  const novel = await getNovelWithChapters(id, session.user.id, page);

  if (!novel) {
    notFound();
  }
  const totalPages = Math.max(1, Math.ceil(novel._count.chapters / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/dashboard"
            className="mb-2 inline-flex min-h-10 items-center text-sm text-zinc-500 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            &larr; 대시보드로
          </Link>
          <h1 className="text-3xl font-bold text-white">
            회차 관리
          </h1>
          <p className="mt-1 truncate text-zinc-500">{novel.title}</p>
        </div>
        <Link
          href={`/novels/${id}/chapters/new`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto"
        >
          <svg aria-hidden="true" className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          새 회차 작성
        </Link>
      </header>

      <nav aria-label="작품 관리 메뉴" className="mb-6 overflow-x-auto">
        <div className="flex min-w-max gap-2 text-sm">
          <span aria-current="page" className="inline-flex min-h-10 items-center rounded-md bg-primary/15 px-3 font-medium text-accent">회차 관리</span>
          <Link
            href={`/novels/${id}/characters`}
            className="inline-flex min-h-10 items-center rounded-md px-3 text-zinc-500 transition-colors hover:bg-background-tertiary hover:text-white"
          >
            캐릭터 관리
          </Link>
          <Link
            href={`/novels/${id}/edit`}
            className="inline-flex min-h-10 items-center rounded-md px-3 text-zinc-500 transition-colors hover:bg-background-tertiary hover:text-white"
          >
            작품 설정
          </Link>
        </div>
      </nav>

      <Card padding="none" className="overflow-hidden">
        <ChapterList
          novelId={id}
          chapters={novel.chapters}
          mode="manage"
        />
      </Card>
      <ServerPagination pathname={`/novels/${id}/chapters`} page={page} totalPages={totalPages} />
    </div>
  );
}
