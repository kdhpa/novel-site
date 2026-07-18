import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import ChapterWriter from '@/components/editor/ChapterWriter';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: '새 회차 작성',
  description: '새 회차를 작성합니다.',
};

async function getNovelInfo(id: string, userId: string) {
  const novel = await prisma.novel.findFirst({
    where: {
      id,
      authorId: userId,
    },
    select: {
      chapters: {
        orderBy: { chapterNumber: 'desc' },
        take: 1,
        select: { chapterNumber: true },
      },
      characters: {
        select: {
          id: true,
          name: true,
          appearance: true,
          role: true,
        },
      },
    },
  });

  return novel;
}

export default async function NewChapterPage({ params }: PageProps) {
  const [{ id }, session] = await Promise.all([params, auth()]);

  if (!session?.user) {
    redirect('/login');
  }

  const novel = await getNovelInfo(id, session.user.id);

  if (!novel) {
    notFound();
  }

  const nextChapterNumber = (novel.chapters[0]?.chapterNumber || 0) + 1;

  return (
    <ChapterWriter
      novelId={id}
      mode="create"
      nextChapterNumber={nextChapterNumber}
      characters={novel.characters || []}
    />
  );
}
