import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import Card from '@/components/ui/Card';
import CharacterForm from '@/components/character/CharacterForm';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string; characterId: string }>;
}

export const metadata: Metadata = {
  title: '캐릭터 수정',
  description: '캐릭터 정보를 수정하세요.',
};

async function getCharacter(novelId: string, characterId: string, userId: string) {
  const character = await prisma.character.findFirst({
    where: {
      id: characterId,
      novelId,
      novel: {
        authorId: userId,
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      appearance: true,
      personality: true,
      role: true,
      portraitUrl: true,
      portraitPrompt: true,
      novel: {
        select: {
          title: true,
          genres: true,
        },
      },
    },
  });

  return character;
}

export default async function EditCharacterPage({ params }: PageProps) {
  const [{ id, characterId }, session] = await Promise.all([params, auth()]);

  if (!session?.user) {
    redirect('/login');
  }

  const character = await getCharacter(id, characterId, session.user.id);

  if (!character) {
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
          캐릭터 수정
        </h1>
        <p className="mt-1 text-zinc-500">{character.novel.title}</p>
      </header>

      <Card padding="none" className="p-4 sm:p-6">
        <CharacterForm
          novelId={id}
          novelGenre={character.novel.genres?.[0] || 'OTHER'}
          character={{
            id: character.id,
            name: character.name,
            description: character.description,
            appearance: character.appearance,
            personality: character.personality,
            role: character.role,
            portraitUrl: character.portraitUrl,
            portraitPrompt: character.portraitPrompt,
          }}
          isEditing
        />
      </Card>
    </div>
  );
}
