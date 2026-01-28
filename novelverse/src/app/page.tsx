import Link from 'next/link';
import prisma from '@/lib/prisma';
import NovelCard from '@/components/novel/NovelCard';
import Button from '@/components/ui/Button';
import type { NovelListItem } from '@/types';

async function getLatestNovels(): Promise<NovelListItem[]> {
  try {
    const novels = await prisma.novel.findMany({
      where: { isPublished: true },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        coverImage: true,
        genre: true,
        status: true,
        viewCount: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            nickname: true,
            image: true,
          },
        },
        _count: {
          select: {
            chapters: { where: { isPublished: true } },
            likes: true,
          },
        },
      },
    });
    return novels as NovelListItem[];
  } catch {
    return [];
  }
}

async function getPopularNovels(): Promise<NovelListItem[]> {
  try {
    const novels = await prisma.novel.findMany({
      where: { isPublished: true },
      take: 5,
      orderBy: { viewCount: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        coverImage: true,
        genre: true,
        status: true,
        viewCount: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            nickname: true,
            image: true,
          },
        },
        _count: {
          select: {
            chapters: { where: { isPublished: true } },
            likes: true,
          },
        },
      },
    });
    return novels as NovelListItem[];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [latestNovels, popularNovels] = await Promise.all([
    getLatestNovels(),
    getPopularNovels(),
  ]);

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-indigo-600 to-purple-700 dark:from-indigo-900 dark:to-purple-950 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            상상을 현실로,
            <br />
            이야기에 생명을 불어넣다
          </h1>
          <p className="text-lg md:text-xl text-indigo-100 mb-8 max-w-2xl mx-auto">
            AI 이미지 생성 기능이 포함된 웹소설 플랫폼 NovelVerse에서
            <br />
            여러분만의 이야기를 시작하세요.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/novels">
              <Button size="lg" className="bg-white text-indigo-600 hover:bg-indigo-50">
                작품 둘러보기
              </Button>
            </Link>
            <Link href="/register">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                작가로 시작하기
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-center mb-12 text-gray-900 dark:text-white">
            NovelVerse만의 특별한 기능
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">AI 이미지 생성</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Stability AI를 활용하여 표지와 삽화를 자동으로 생성하세요.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">강력한 에디터</h3>
              <p className="text-gray-600 dark:text-gray-400">
                TipTap 기반의 리치 텍스트 에디터로 편리하게 글을 작성하세요.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">편안한 독서 환경</h3>
              <p className="text-gray-600 dark:text-gray-400">
                라이트/다크 모드와 글자 크기 조절로 최적의 독서 경험을 제공합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Novels Section */}
      {popularNovels.length > 0 && (
        <section className="py-16 bg-gray-50 dark:bg-gray-950">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                인기 작품
              </h2>
              <Link href="/novels?sort=popular" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                더보기
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {popularNovels.map((novel) => (
                <NovelCard key={novel.id} novel={novel} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Latest Novels Section */}
      {latestNovels.length > 0 && (
        <section className="py-16 bg-white dark:bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                최신 작품
              </h2>
              <Link href="/novels" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                더보기
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {latestNovels.map((novel) => (
                <NovelCard key={novel.id} novel={novel} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="py-16 bg-indigo-600 dark:bg-indigo-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            지금 바로 여러분의 이야기를 시작하세요
          </h2>
          <p className="text-indigo-100 mb-8">
            무료로 가입하고 첫 작품을 등록해보세요.
          </p>
          <Link href="/register">
            <Button size="lg" className="bg-white text-indigo-600 hover:bg-indigo-50">
              무료로 시작하기
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
