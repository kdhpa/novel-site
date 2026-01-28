import Link from 'next/link';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { GenreBadge, StatusBadge } from '@/components/ui/Badge';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '작가 대시보드',
  description: '내 작품을 관리하세요.',
};

async function getUserNovels(userId: string) {
  const novels = await prisma.novel.findMany({
    where: { authorId: userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: {
        select: {
          chapters: true,
          likes: true,
          bookmarks: true,
        },
      },
    },
  });

  return novels;
}

async function getUserStats(userId: string) {
  const stats = await prisma.novel.aggregate({
    where: { authorId: userId },
    _sum: { viewCount: true },
    _count: true,
  });

  const totalChapters = await prisma.chapter.count({
    where: { novel: { authorId: userId } },
  });

  const totalLikes = await prisma.like.count({
    where: { novel: { authorId: userId } },
  });

  return {
    totalNovels: stats._count,
    totalViews: stats._sum.viewCount || 0,
    totalChapters,
    totalLikes,
  };
}

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  const [novels, stats] = await Promise.all([
    getUserNovels(session.user.id),
    getUserStats(session.user.id),
  ]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            작가 대시보드
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            안녕하세요, {session.user.nickname || session.user.name}님!
          </p>
        </div>
        <Link href="/novels/new">
          <Button>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            새 작품 등록
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {stats.totalNovels}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">작품 수</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {stats.totalChapters}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">총 회차</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {stats.totalViews.toLocaleString()}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">총 조회수</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {stats.totalLikes}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">총 좋아요</p>
          </div>
        </Card>
      </div>

      {/* Novel List */}
      <Card padding="none">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            내 작품
          </h2>
        </div>

        {novels.length === 0 ? (
          <div className="p-8 text-center">
            <svg
              className="mx-auto w-12 h-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <p className="mt-4 text-gray-500 dark:text-gray-400">
              아직 등록된 작품이 없습니다.
            </p>
            <Link href="/novels/new">
              <Button className="mt-4">첫 작품 등록하기</Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {novels.map((novel) => (
              <div
                key={novel.id}
                className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Link
                      href={`/novels/${novel.id}`}
                      className="font-medium text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      {novel.title}
                    </Link>
                    <GenreBadge genre={novel.genre} />
                    <StatusBadge status={novel.status} />
                    {!novel.isPublished && (
                      <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-full">
                        비공개
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>{novel._count.chapters}화</span>
                    <span>{novel._count.likes} 좋아요</span>
                    <span>{novel.viewCount.toLocaleString()} 조회</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/novels/${novel.id}/chapters`}>
                    <Button variant="ghost" size="sm">
                      회차 관리
                    </Button>
                  </Link>
                  <Link href={`/novels/${novel.id}/edit`}>
                    <Button variant="outline" size="sm">
                      수정
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
