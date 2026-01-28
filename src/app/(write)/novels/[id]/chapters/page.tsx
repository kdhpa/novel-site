import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import ChapterList from '@/components/novel/ChapterList';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: '회차 관리',
  description: '작품의 회차를 관리하세요.',
};

async function getNovelWithChapters(id: string, userId: string) {
  const novel = await prisma.novel.findFirst({
    where: {
      id,
      authorId: userId,
    },
    include: {
      chapters: {
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
    },
  });

  return novel;
}

export default async function ChaptersManagementPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const novel = await getNovelWithChapters(id, session.user.id);

  if (!novel) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 mb-2 inline-block"
          >
            &larr; 대시보드로
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            회차 관리
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{novel.title}</p>
        </div>
        <Link href={`/novels/${id}/chapters/new`}>
          <Button>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            새 회차 작성
          </Button>
        </Link>
      </div>

      <Card padding="lg">
        <ChapterList
          novelId={id}
          chapters={novel.chapters}
          isAuthor={true}
        />
      </Card>
    </div>
  );
}
