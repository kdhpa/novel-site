import Link from 'next/link';
import Image from 'next/image';
import { UserRound } from 'lucide-react';
import type { AuthorRankingItem } from '@/types';
import { isOptimizableImageSource } from '@/lib/image-hosts';

interface AuthorCardProps {
  author: AuthorRankingItem;
  rank?: number;
}

function formatViewCount(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}만`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}천`;
  return count.toLocaleString();
}

export default function AuthorCard({ author, rank }: AuthorCardProps) {
  return (
    <Link href={`/authors/${author.id}`} className="group block">
      <div className="relative rounded-md border border-border bg-background-secondary p-5 transition-colors hover:border-accent-muted hover:bg-background-tertiary">
        {rank && rank <= 3 && (
          <div className={`absolute -left-2 -top-2 flex h-8 w-8 items-center justify-center rounded text-sm font-bold ${rank === 1 ? 'bg-accent text-zinc-950' : rank === 2 ? 'bg-zinc-300 text-zinc-950' : 'bg-primary text-white'}`}>
            {rank}
          </div>
        )}

        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4 h-24 w-24 overflow-hidden rounded-md bg-background-tertiary ring-1 ring-border transition-colors group-hover:ring-accent-muted">
            {author.image ? (
              <Image src={author.image} alt={author.nickname || '작가'} fill sizes="96px" unoptimized={!isOptimizableImageSource(author.image)} className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-600"><UserRound className="h-10 w-10" /></div>
            )}
          </div>

          <h3 className="line-clamp-1 text-lg font-semibold text-white transition-colors group-hover:text-accent">{author.nickname || '익명 작가'}</h3>
          {author.bio && <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{author.bio}</p>}

          <div className="mt-4 flex items-center gap-4 text-sm">
            <div>
              <span className="font-semibold text-white">{formatViewCount(author.totalViewCount)}</span>
              <p className="text-xs text-zinc-500">조회</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <span className="font-semibold text-white">{author.novelCount}</span>
              <p className="text-xs text-zinc-500">작품</p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
