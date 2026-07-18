import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, Clock3, Heart } from 'lucide-react';
import { GenreLabels } from '@/types';
import { isOptimizableImageSource } from '@/lib/image-hosts';
import type { LibraryTab } from './types';
import type { LibraryItem } from './types';

export type { LibraryItem } from './types';

interface LibraryNovelCardProps {
  item: LibraryItem;
  tab: LibraryTab;
}

function formatDate(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 60) return `${minutes || 1}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;

  return new Date(date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function LibraryNovelCard({ item, tab }: LibraryNovelCardProps) {
  const { novel } = item;
  const isHistory = tab === 'history';
  const continueLink = isHistory && item.continueChapterId ? `/novels/${novel.id}/${item.continueChapterId}` : `/novels/${novel.id}`;
  const dateToShow = isHistory || tab === 'reviews' ? item.updatedAt : item.createdAt;
  const primaryGenre = novel.genres?.[0];

  return (
    <div className="group relative rounded-md border border-border bg-background-secondary p-3 transition-colors hover:border-accent-muted hover:bg-background-tertiary">
      <Link href={`/novels/${novel.id}`} className="flex gap-4 pr-0 sm:pr-28">
        <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-md bg-background-tertiary">
          {novel.coverImage ? (
            <Image src={novel.coverImage} alt={novel.title} fill sizes="80px" unoptimized={!isOptimizableImageSource(novel.coverImage)} className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
              <BookOpen className="h-8 w-8" />
            </div>
          )}
          {novel.status === 'ONGOING' && <span className="absolute left-1 top-1 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">연재 중</span>}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {primaryGenre && <span className="rounded bg-background-tertiary px-1.5 py-0.5 text-xs text-zinc-300">{GenreLabels[primaryGenre]}</span>}
            {isHistory && item.lastChapter && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-[#9adbd2]">{item.lastChapter}화까지 읽음</span>
            )}
            {tab === 'reviews' && item.rating && (
              <span className="rounded bg-yellow-500/15 px-1.5 py-0.5 text-xs text-yellow-300">★ {item.rating}</span>
            )}
          </div>

          <h3 className="line-clamp-1 font-semibold text-white transition-colors group-hover:text-accent">{novel.title}</h3>
          <p className="mt-0.5 line-clamp-1 text-sm text-zinc-500">{novel.author.nickname || '익명 작가'}</p>
          {tab === 'reviews' && item.contentPreview && <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{item.contentPreview}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{novel._count.chapters}화</span>
            <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{novel._count.likes}</span>
            {dateToShow && <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatDate(dateToShow)}</span>}
          </div>
        </div>
      </Link>

      {isHistory && item.lastChapter && (
        <Link href={continueLink} className="mt-3 inline-flex rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover sm:absolute sm:right-3 sm:top-1/2 sm:mt-0 sm:-translate-y-1/2">
          이어보기
        </Link>
      )}
    </div>
  );
}
