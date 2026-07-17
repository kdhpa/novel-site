import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, Eye, Heart } from 'lucide-react';
import type { NovelListItem } from '@/types';
import { GenreLabels, StatusLabels } from '@/types';
import { isOptimizableImageSource } from '@/lib/image-hosts';

interface NovelCardProps {
  novel: NovelListItem;
  showDescription?: boolean;
  rank?: number;
}

function formatCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}만`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}천`;
  return value.toLocaleString();
}

export default function NovelCard({ novel, showDescription = false, rank }: NovelCardProps) {
  const primaryGenre = novel.genres?.[0];

  return (
    <Link href={`/novels/${novel.id}`} className="group block min-w-0">
      <div className="relative mb-2 aspect-[3/4] overflow-hidden rounded-md border border-border bg-background-tertiary card-hover">
        {novel.coverImage ? (
          <Image
            src={novel.coverImage}
            alt={novel.title}
            fill
            sizes="(max-width: 639px) 50vw, (max-width: 1023px) 25vw, 180px"
            unoptimized={!isOptimizableImageSource(novel.coverImage)}
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background-secondary text-zinc-500">
            <BookOpen className="h-10 w-10" />
            <span className="px-3 text-center text-xs">표지 없음</span>
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {rank ? (
            <span className="rounded bg-accent px-2 py-0.5 text-xs font-bold text-zinc-950">#{rank}</span>
          ) : (
            <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold text-white">
              {novel.status === 'ONGOING' ? '연재 중' : StatusLabels[novel.status]}
            </span>
          )}
        </div>

        {showDescription && novel.description && (
          <div className="absolute inset-0 flex items-end bg-black/72 p-3 opacity-0 transition-opacity group-hover:opacity-100">
            <p className="line-clamp-5 text-xs leading-5 text-zinc-200">{novel.description}</p>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div className="mb-1 flex min-h-5 items-center gap-1">
          {primaryGenre && (
            <span className="rounded bg-background-tertiary px-1.5 py-0.5 text-[11px] text-zinc-300">
              {GenreLabels[primaryGenre]}
            </span>
          )}
          {novel.genres.length > 1 && <span className="text-[11px] text-zinc-500">+{novel.genres.length - 1}</span>}
        </div>

        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-white transition-colors group-hover:text-accent">
          {novel.title}
        </h3>
        <p className="mt-1 line-clamp-1 text-xs text-zinc-500">{novel.author.nickname || '익명 작가'}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" />
            {novel._count.chapters}화
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" />
            {formatCount(novel._count.likes)}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            {formatCount(novel.viewCount)}
          </span>
        </div>
      </div>
    </Link>
  );
}
