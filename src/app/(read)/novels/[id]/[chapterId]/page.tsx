import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import Reader from '@/components/novel/Reader';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string; chapterId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, chapterId } = await params;

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, novelId: id },
    include: {
      novel: { select: { title: true } },
    },
  });

  if (!chapter) {
    return { title: '회차를 찾을 수 없습니다' };
  }

  return {
    title: `${chapter.chapterNumber}화. ${chapter.title} - ${chapter.novel.title}`,
    description: `${chapter.novel.title} ${chapter.chapterNumber}화`,
  };
}

async function getChapter(novelId: string, chapterId: string) {
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, novelId, isPublished: true },
    include: {
      novel: {
        select: {
          id: true,
          title: true,
          genre: true,
        },
      },
    },
  });

  return chapter;
}

async function getAdjacentChapters(novelId: string, chapterNumber: number) {
  const [prevChapter, nextChapter] = await Promise.all([
    prisma.chapter.findFirst({
      where: {
        novelId,
        chapterNumber: { lt: chapterNumber },
        isPublished: true,
      },
      orderBy: { chapterNumber: 'desc' },
      select: { id: true },
    }),
    prisma.chapter.findFirst({
      where: {
        novelId,
        chapterNumber: { gt: chapterNumber },
        isPublished: true,
      },
      orderBy: { chapterNumber: 'asc' },
      select: { id: true },
    }),
  ]);

  return {
    prevChapterId: prevChapter?.id,
    nextChapterId: nextChapter?.id,
  };
}

export default async function ChapterReaderPage({ params }: PageProps) {
  const { id, chapterId } = await params;

  const chapter = await getChapter(id, chapterId);

  if (!chapter) {
    notFound();
  }

  const { prevChapterId, nextChapterId } = await getAdjacentChapters(
    id,
    chapter.chapterNumber
  );

  // Increment view count
  await prisma.chapter.update({
    where: { id: chapterId },
    data: { viewCount: { increment: 1 } },
  });

  return (
    <div className="bg-white dark:bg-gray-900 min-h-screen py-8">
      <Reader
        novelId={id}
        chapter={chapter}
        prevChapterId={prevChapterId}
        nextChapterId={nextChapterId}
      />
    </div>
  );
}
