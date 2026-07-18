import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import Card from '@/components/ui/Card';
import CharacterList from '@/components/character/CharacterList';
import type { Metadata } from 'next';
import ServerPagination from '@/components/ui/ServerPagination';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

const PAGE_SIZE = 24;

export const metadata: Metadata = {
  title: '캐릭터 관리',
  description: '작품의 캐릭터를 관리합니다.',
};

async function getNovelWithCharacters(id: string, userId: string, page: number) {
  const novel = await prisma.novel.findFirst({
    where: {
      id,
      authorId: userId,
    },
    select: {
      title: true,
      _count: { select: { characters: true } },
      characters: {
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          role: true,
          portraitUrl: true,
          appearance: true,
          description: true,
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

export default async function CharactersManagementPage({ params, searchParams }: PageProps) {
  const [{ id }, session, query] = await Promise.all([params, auth(), searchParams]);

  if (!session?.user) {
    redirect('/login');
  }

  const page = parsePage(query.page);
  const novel = await getNovelWithCharacters(id, session.user.id, page);

  if (!novel) {
    notFound();
  }
  const totalPages = Math.max(1, Math.ceil(novel._count.characters / PAGE_SIZE));

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
            캐릭터 관리
          </h1>
          <p className="mt-1 truncate text-zinc-500">{novel.title}</p>
        </div>
        <Link
          href={`/novels/${id}/characters/new`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto"
        >
          <svg aria-hidden="true" className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          새 캐릭터 추가
        </Link>
      </header>

      <nav aria-label="작품 관리 메뉴" className="mb-6 overflow-x-auto">
        <div className="flex min-w-max gap-2 text-sm">
          <Link
            href={`/novels/${id}/chapters`}
            className="inline-flex min-h-10 items-center rounded-md px-3 text-zinc-500 transition-colors hover:bg-background-tertiary hover:text-white"
          >
            회차 관리
          </Link>
          <span aria-current="page" className="inline-flex min-h-10 items-center rounded-md bg-primary/15 px-3 font-medium text-accent">캐릭터 관리</span>
          <Link
            href={`/novels/${id}/edit`}
            className="inline-flex min-h-10 items-center rounded-md px-3 text-zinc-500 transition-colors hover:bg-background-tertiary hover:text-white"
          >
            작품 설정
          </Link>
        </div>
      </nav>

      <Card padding="none" className="p-4 sm:p-6">
        {novel.characters.length === 0 ? (
          <div className="py-12 text-center">
            <svg
              aria-hidden="true"
              className="mx-auto h-12 w-12 text-zinc-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <h2 className="mt-4 text-lg font-medium text-white">
              등록된 캐릭터가 없습니다
            </h2>
            <p className="mt-2 text-zinc-500">
              캐릭터를 추가하면 AI 이미지 생성에 필요한 외형 정보를 사용할 수 있습니다.
            </p>
            <div className="mt-6">
              <Link
                href={`/novels/${id}/characters/new`}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                첫 캐릭터 추가하기
              </Link>
            </div>
          </div>
        ) : (
          <CharacterList novelId={id} characters={novel.characters} />
        )}
      </Card>
      <ServerPagination pathname={`/novels/${id}/characters`} page={page} totalPages={totalPages} />
    </div>
  );
}
