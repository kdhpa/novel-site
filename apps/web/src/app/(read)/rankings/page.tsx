import type { Metadata } from 'next';
import prisma from '@/lib/prisma';
import NovelCard from '@/components/novel/NovelCard';
import type { NovelListItem } from '@/types';
import { DEFAULT_SOCIAL_IMAGE, SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: '랭킹',
  description: '조회수와 독자 반응을 기준으로 인기 웹소설을 확인하세요.',
  alternates: { canonical: '/rankings' },
  openGraph: {
    type: 'website',
    url: '/rankings',
    locale: 'ko_KR',
    siteName: SITE_NAME,
    title: 'NovelVerse 웹소설 랭킹',
    description: '조회수와 독자 반응을 기준으로 인기 웹소설을 확인하세요.',
    images: [{ url: DEFAULT_SOCIAL_IMAGE, alt: 'NovelVerse 웹소설 랭킹' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NovelVerse 웹소설 랭킹',
    description: '조회수와 독자 반응을 기준으로 인기 웹소설을 확인하세요.',
    images: [DEFAULT_SOCIAL_IMAGE],
  },
};

export const dynamic = 'force-dynamic';

async function getRankingNovels(): Promise<NovelListItem[]> {
  const rankedIds = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT n.id
    FROM novels n
    WHERE n."isPublished" = true AND n."approvalStatus" = 'APPROVED'::"ApprovalStatus"
    ORDER BY (n."viewCount"::bigint + n."likeCount"::bigint * 10) DESC, n.id DESC
    LIMIT 50
  `;
  const novels = await prisma.novel.findMany({
    where: {
      isPublished: true,
      approvalStatus: 'APPROVED',
      id: { in: rankedIds.map((row) => row.id) },
    },
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
  });

  const novelsById = new Map(novels.map((novel) => [novel.id, novel as NovelListItem]));
  return rankedIds
    .map((row) => novelsById.get(row.id))
    .filter((novel): novel is NovelListItem => Boolean(novel));
}

export default async function RankingsPage() {
  const novels = await getRankingNovels();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 border-b border-border pb-5">
          <p className="mb-2 text-sm font-semibold text-accent">순위</p>
          <h1 className="text-3xl font-bold text-white">실시간 랭킹</h1>
          <p className="mt-2 text-sm text-zinc-500">조회수와 좋아요를 함께 반영한 인기 작품 순위입니다.</p>
        </div>
        {novels.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {novels.map((novel, index) => <NovelCard key={novel.id} novel={novel} showDescription rank={index + 1} />)}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-background-secondary py-16 text-center text-zinc-500">아직 랭킹에 표시할 작품이 없습니다.</div>
        )}
      </div>
    </div>
  );
}
