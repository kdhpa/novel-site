import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import NovelForm from '@/components/editor/NovelForm';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: '작품 수정',
  description: '작품 정보를 수정하세요.',
};

async function getNovel(id: string, userId: string) {
  const novel = await prisma.novel.findFirst({
    where: {
      id,
      authorId: userId,
    },
    include: {
      tags: {
        include: { tag: true },
      },
    },
  });

  return novel;
}

export default async function EditNovelPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const novel = await getNovel(id, session.user.id);

  if (!novel) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
        작품 수정
      </h1>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <NovelForm
          mode="edit"
          initialData={{
            id: novel.id,
            title: novel.title,
            description: novel.description || '',
            genre: novel.genre,
            status: novel.status,
            coverImage: novel.coverImage || '',
            tags: novel.tags.map((t) => t.tag.name),
            isPublished: novel.isPublished,
          }}
        />
      </div>
    </div>
  );
}
