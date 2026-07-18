import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import Card from '@/components/ui/Card';
import CharacterForm from '@/components/character/CharacterForm';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: '새 캐릭터 추가',
  description: '작품에 새 캐릭터를 추가하세요.',
};

async function getNovel(id: string, userId: string) {
  const novel = await prisma.novel.findFirst({
    where: {
      id,
      authorId: userId,
    },
    select: {
      title: true,
      genres: true,
    },
  });

  return novel;
}

export default async function NewCharacterPage({ params }: PageProps) {
  const [{ id }, session] = await Promise.all([params, auth()]);

  if (!session?.user) {
    redirect('/login');
  }

  const novel = await getNovel(id, session.user.id);

  if (!novel) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8">
        <Link
          href={`/novels/${id}/characters`}
          className="mb-2 inline-flex min-h-10 items-center text-sm text-zinc-500 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          &larr; 캐릭터 목록으로
        </Link>
        <h1 className="text-3xl font-bold text-white">
          새 캐릭터 추가
        </h1>
        <p className="mt-1 text-zinc-500">{novel.title}</p>
      </header>

      <Card padding="none" className="p-4 sm:p-6">
        <CharacterForm novelId={id} novelGenre={novel.genres?.[0] || 'OTHER'} />
      </Card>
    </div>
  );
}
