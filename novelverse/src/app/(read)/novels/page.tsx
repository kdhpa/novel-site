import prisma from '@/lib/prisma';
import NovelList from '@/components/novel/NovelList';
import type { NovelListItem } from '@/types';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '작품 목록',
  description: 'NovelVerse에서 다양한 웹소설을 만나보세요.',
};

async function getNovels(): Promise<NovelListItem[]> {
  try {
    const novels = await prisma.novel.findMany({
      where: { isPublished: true },
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

export default async function NovelsPage() {
  const novels = await getNovels();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
        작품 목록
      </h1>

      <NovelList novels={novels} />
    </div>
  );
}
