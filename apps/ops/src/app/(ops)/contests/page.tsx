import { prisma } from '@novelverse/db';
import ContestManager from './ContestManager';
import Pagination from '../Pagination';
import { parsePage } from '@/lib/pagination';

export const metadata = {
  title: '공모전 관리',
};

const PAGE_SIZE = 30;

export default async function OpsContestsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const [contests, total] = await Promise.all([
    prisma.season.findMany({
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        coverImage: true,
        startsAt: true,
        endsAt: true,
        isActive: true,
        _count: { select: { novels: true } },
      },
    }),
    prisma.season.count(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">공모전 관리</h1>
        <p className="mt-1 text-sm text-muted">시즌별 공모전을 열고 응모 기간과 안내 내용을 운영합니다.</p>
      </div>

      <ContestManager
        contests={contests.map((contest) => ({
          id: contest.id,
          slug: contest.slug,
          title: contest.title,
          description: contest.description || '',
          coverImage: contest.coverImage || '',
          startsAt: contest.startsAt.toISOString(),
          endsAt: contest.endsAt.toISOString(),
          isActive: contest.isActive,
          novelCount: contest._count.novels,
        }))}
      />
      <Pagination page={page} totalPages={totalPages} pathname="/contests" />
    </div>
  );
}
