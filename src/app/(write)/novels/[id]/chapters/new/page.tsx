import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import ChapterEditor from '@/components/editor/ChapterEditor';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: '새 회차 작성',
  description: '새로운 회차를 작성하세요.',
};

async function getNovelInfo(id: string, userId: string) {
  const novel = await prisma.novel.findFirst({
    where: {
      id,
      authorId: userId,
    },
    select: {
      id: true,
      title: true,
      genre: true,
      chapters: {
        orderBy: { chapterNumber: 'desc' },
        take: 1,
        select: { chapterNumber: true },
      },
    },
  });

  return novel;
}

export default async function NewChapterPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const novel = await getNovelInfo(id, session.user.id);

  if (!novel) {
    notFound();
  }

  const nextChapterNumber = (novel.chapters[0]?.chapterNumber || 0) + 1;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <Link
          href={`/novels/${id}/chapters`}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 mb-2 inline-block"
        >
          &larr; 회차 목록으로
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          새 회차 작성
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">{novel.title}</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <ChapterEditor
          novelId={id}
          mode="create"
          nextChapterNumber={nextChapterNumber}
        />
      </div>
    </div>
  );
}
