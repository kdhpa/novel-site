import prisma from '@/lib/prisma';
import NovelCard from '@/components/novel/NovelCard';
import ServerPagination from '@/components/ui/ServerPagination';
import type { NovelListItem } from '@/types';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '신작',
  description: 'NovelVerse의 최신 웹소설을 만나보세요.',
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1;
}

async function getNewReleases(page: number) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const where = { isPublished: true, approvalStatus: 'APPROVED' as const, createdAt: { gte: thirtyDaysAgo } };

    const [novels, total] = await Promise.all([
      prisma.novel.findMany({
        where,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          title: true,
          description: true,
          coverImage: true,
          genres: true,
          status: true,
          viewCount: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { id: true, nickname: true, image: true } },
          _count: { select: { chapters: { where: { isPublished: true } }, likes: true } },
        },
      }),
      prisma.novel.count({ where }),
    ]);

    return { novels: novels as NovelListItem[], total };
  } catch {
    return { novels: [] as NovelListItem[], total: 0 };
  }
}

export default async function NewReleasesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = parsePage((await searchParams).page);
  const { novels, total } = await getNewReleases(page);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 border-b border-border pb-5">
          <p className="mb-2 text-sm font-semibold text-accent">신작</p>
          <h1 className="text-3xl font-bold text-white">신작</h1>
          <p className="mt-1 text-sm text-zinc-500">최근 30일 안에 등록된 새로운 작품 {total.toLocaleString()}개입니다.</p>
        </div>
        {novels.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {novels.map((novel) => <NovelCard key={novel.id} novel={novel} showDescription />)}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-background-secondary py-16 text-center text-zinc-500">최근 등록된 공개 작품이 없습니다.</div>
        )}
        <ServerPagination pathname="/novels/new-releases" page={page} totalPages={totalPages} />
      </div>
    </div>
  );
}
