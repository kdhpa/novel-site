'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import CharacterCard from './CharacterCard';

interface CharacterListProps {
  novelId: string;
  characters: {
    id: string;
    name: string;
    role: string | null;
    portraitUrl: string | null;
    appearance: string;
    description?: string | null;
  }[];
}

export default function CharacterList({ novelId, characters }: CharacterListProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const deleteInFlightRef = useRef(false);

  const handleDelete = async (characterId: string) => {
    if (deleteInFlightRef.current) return;

    deleteInFlightRef.current = true;
    setIsDeleting(characterId);

    try {
      const response = await fetch(`/api/novels/${novelId}/characters/${characterId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        router.refresh();
      } else {
        alert(data.error || '삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      deleteInFlightRef.current = false;
      setIsDeleting(null);
    }
  };

  if (characters.length === 0) {
    return (
      <div className="py-16 text-center">
        <svg
          aria-hidden="true"
          className="mx-auto h-16 w-16 text-zinc-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        <p className="mt-4 text-zinc-500">등록된 캐릭터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-busy={isDeleting !== null}>
      <span className="sr-only" role="status" aria-live="polite">
        {isDeleting ? '캐릭터를 삭제하고 있습니다.' : ''}
      </span>
      {characters.map((character) => (
        <div
          key={character.id}
          className={isDeleting === character.id ? 'pointer-events-none opacity-50' : ''}
        >
          <CharacterCard
            character={character}
            novelId={novelId}
            onDelete={handleDelete}
          />
        </div>
      ))}
    </div>
  );
}
