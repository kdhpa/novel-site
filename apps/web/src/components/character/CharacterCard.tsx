'use client';

import Link from 'next/link';
import Image from 'next/image';
import { isOptimizableImageSource } from '@/lib/image-hosts';

interface CharacterCardProps {
  character: {
    id: string;
    name: string;
    role: string | null;
    portraitUrl: string | null;
    appearance: string;
    description?: string | null;
  };
  novelId: string;
  onDelete?: (id: string) => void;
}

export default function CharacterCard({ character, novelId, onDelete }: CharacterCardProps) {

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDelete && confirm(`"${character.name}" 캐릭터를 삭제하시겠습니까?`)) {
      onDelete(character.id);
    }
  };

  return (
    <article className="group flex items-start gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:border-accent-muted hover:bg-background-tertiary sm:gap-4 sm:p-4">
      <Link
        href={`/novels/${novelId}/characters/${character.id}/edit`}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary sm:gap-4"
        aria-label={`${character.name} 캐릭터 수정`}
      >
        {/* Portrait */}
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-background-tertiary sm:h-20 sm:w-20">
          {character.portraitUrl ? (
            <Image
              src={character.portraitUrl}
              alt={`${character.name} 초상화`}
              fill
              sizes="(min-width: 640px) 80px, 64px"
              className="object-cover"
              unoptimized={!isOptimizableImageSource(character.portraitUrl)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                aria-hidden="true"
                className="h-8 w-8 text-zinc-600"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-white transition-colors group-hover:text-accent">
              {character.name}
            </h3>
            {character.role && (
              <span className="rounded bg-primary/15 px-2 py-0.5 text-xs text-accent">
                {character.role}
              </span>
            )}
          </div>

          {character.description && (
            <p className="mt-1 line-clamp-1 text-sm text-zinc-400">
              {character.description}
            </p>
          )}

          <p className="mt-2 line-clamp-2 text-xs text-zinc-500">
            <span className="text-zinc-400">외형:</span> {character.appearance}
          </p>
        </div>
      </Link>

      {/* Actions */}
      {onDelete && (
        <div className="shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            title="삭제"
            aria-label={`${character.name} 캐릭터 삭제`}
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      )}
    </article>
  );
}
