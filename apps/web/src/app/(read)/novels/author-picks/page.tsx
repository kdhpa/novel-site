import prisma from '@/lib/prisma';
import AuthorCard from '@/components/author/AuthorCard';
import type { AuthorRankingItem } from '@/types';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '인기 작가',
  description: '독자 반응이 좋은 작가와 작품을 만나보세요.',
};

export const dynamic = 'force-dynamic';

async function getTopAuthors(): Promise<AuthorRankingItem[]> {
  try {
    const authorStats = await prisma.novel.groupBy({
      by: ['authorId'],
      _sum: { viewCount: true },
      _count: { id: true },
      where: { isPublished: true, approvalStatus: 'APPROVED' },
      orderBy: { _sum: { viewCount: 'desc' } },
      take: 50,
    });

    if (authorStats.length === 0) return [];
    const authors = await prisma.user.findMany({
      where: { id: { in: authorStats.map((stat) => stat.authorId) } },
      select: { id: true, nickname: true, image: true, bio: true },
    });
    const authorMap = new Map(authors.map((author) => [author.id, author]));

    return authorStats
      .map((stat) => {
        const author = authorMap.get(stat.authorId);
        if (!author) return null;
        return {
          id: author.id,
          nickname: author.nickname,
          image: author.image,
          bio: author.bio,
          totalViewCount: stat._sum.viewCount || 0,
          novelCount: stat._count.id,
        };
      })
      .filter((item): item is AuthorRankingItem => item !== null);
  } catch {
    return [];
  }
}

export default async function AuthorPicksPage() {
  const authors = await getTopAuthors();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 border-b border-border pb-5">
          <p className="mb-2 text-sm font-semibold text-accent">작가</p>
          <h1 className="text-3xl font-bold text-white">인기 작가</h1>
          <p className="mt-1 text-sm text-zinc-500">조회수와 작품 수를 기준으로 주목받는 작가입니다.</p>
        </div>

        {authors.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {authors.map((author, index) => <AuthorCard key={author.id} author={author} rank={index + 1} />)}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-background-secondary py-16 text-center text-zinc-500">아직 공개된 작가가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
