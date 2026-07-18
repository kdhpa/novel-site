'use client';

import Link from 'next/link';
import Image from 'next/image';
import { BookOpen } from 'lucide-react';
import type { NovelListItem } from '@/types';
import { isOptimizableImageSource } from '@/lib/image-hosts';

interface NovelCardCompactProps {
  novel: NovelListItem;
}

export default function NovelCardCompact({ novel }: NovelCardCompactProps) {
  return (
    <Link href={`/novels/${novel.id}`} className="group block min-w-0">
      <div className="relative mb-2 aspect-[3/4] overflow-hidden rounded-md border border-border bg-background-tertiary card-hover">
        {novel.coverImage ? (
          <Image
            src={novel.coverImage}
            alt={novel.title}
            fill
            sizes="(max-width: 639px) 128px, 152px"
            unoptimized={!isOptimizableImageSource(novel.coverImage)}
            className="object-cover transition-transform duration-500 group-hover:scale-[1.055]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
            <BookOpen className="h-9 w-9" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/42 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        {novel.status === 'ONGOING' && (
          <span className="absolute left-2 top-2 rounded bg-primary px-2 py-0.5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(47,157,143,0.26)]">연재 중</span>
        )}
      </div>
      <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-white transition-colors group-hover:text-accent">
        {novel.title}
      </h3>
      <p className="mt-1 line-clamp-1 text-xs text-zinc-500">{novel.author.nickname || '익명 작가'}</p>
    </Link>
  );
}
