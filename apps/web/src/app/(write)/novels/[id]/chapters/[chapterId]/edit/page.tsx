import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import ChapterWriter from '@/components/editor/ChapterWriter';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string; chapterId: string }>;
}

export const metadata: Metadata = {
  title: '회차 수정',
  description: '작성 중인 회차를 수정합니다.',
};

async function getChapterForEdit(novelId: string, chapterId: string, userId: string) {
  const chapter = await prisma.chapter.findFirst({
    where: {
      id: chapterId,
      novelId: novelId,
      novel: { authorId: userId },
    },
    select: {
      id: true,
      title: true,
      content: true,
      chapterNumber: true,
      aiImage: true,
      aiImagePrompt: true,
      isPublished: true,
      novel: {
        select: {
          characters: {
            select: {
              id: true,
              name: true,
              appearance: true,
              role: true,
            },
          },
        },
      },
    },
  });

  return chapter;
}

export default async function EditChapterPage({ params }: PageProps) {
  const [{ id, chapterId }, session] = await Promise.all([params, auth()]);

  if (!session?.user) {
    redirect('/login');
  }

  const chapter = await getChapterForEdit(id, chapterId, session.user.id);

  if (!chapter) {
    notFound();
  }

  return (
    <ChapterWriter
      novelId={id}
      mode="edit"
      initialData={{
        id: chapter.id,
        title: chapter.title,
        content: chapter.content,
        chapterNumber: chapter.chapterNumber,
        aiImage: chapter.aiImage || '',
        aiImagePrompt: chapter.aiImagePrompt || '',
        isPublished: chapter.isPublished,
      }}
      characters={chapter.novel.characters || []}
    />
  );
}
