import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import ChapterList from '@/components/novel/ChapterList';
import { GenreBadge, StatusBadge } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const novel = await prisma.novel.findUnique({
    where: { id },
    select: { title: true, description: true },
  });

  if (!novel) {
    return { title: '작품을 찾을 수 없습니다' };
  }

  return {
    title: novel.title,
    description: novel.description || `${novel.title} - NovelVerse에서 읽기`,
  };
}

async function getNovel(id: string) {
  const novel = await prisma.novel.findUnique({
    where: { id },
    include: {
      author: {
        select: {
          id: true,
          nickname: true,
          image: true,
          bio: true,
        },
      },
      chapters: {
        where: { isPublished: true },
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
      tags: {
        include: { tag: true },
      },
      _count: {
        select: {
          chapters: { where: { isPublished: true } },
          bookmarks: true,
          likes: true,
        },
      },
    },
  });

  return novel;
}

export default async function NovelDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [novel, session] = await Promise.all([
    getNovel(id),
    auth(),
  ]);

  if (!novel) {
    notFound();
  }

  const isAuthor = session?.user?.id === novel.authorId;

  // Increment view count
  await prisma.novel.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Novel Header */}
      <div className="flex flex-col md:flex-row gap-8 mb-8">
        {/* Cover Image */}
        <div className="flex-shrink-0">
          <div className="w-48 h-64 relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden shadow-lg">
            {novel.coverImage ? (
              <Image
                src={novel.coverImage}
                alt={novel.title}
                fill
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <svg
                  className="w-16 h-16 text-gray-300 dark:text-gray-600"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Novel Info */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <GenreBadge genre={novel.genre} />
            <StatusBadge status={novel.status} />
          </div>

          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {novel.title}
          </h1>

          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {novel.author.nickname || '익명'} 작가
          </p>

          {/* Stats */}
          <div className="flex items-center gap-6 mb-4 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {novel._count.chapters}화
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {novel._count.likes}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              {novel._count.bookmarks}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {novel.viewCount}
            </span>
          </div>

          {/* Tags */}
          {novel.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {novel.tags.map(({ tag }) => (
                <span
                  key={tag.id}
                  className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded"
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {novel.description && (
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {novel.description}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-4 mt-6">
            {novel.chapters.length > 0 && (
              <Link href={`/novels/${id}/${novel.chapters[0].id}`}>
                <Button>첫 화 읽기</Button>
              </Link>
            )}
            {isAuthor && (
              <Link href={`/novels/${id}/edit`}>
                <Button variant="outline">작품 수정</Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Chapter List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          회차 목록
        </h2>
        <ChapterList novelId={id} chapters={novel.chapters} />
      </div>
    </div>
  );
}
