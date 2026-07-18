import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Eye, FileText } from 'lucide-react';
import type { ChapterListItem } from '@/types';

interface ReaderChapterListProps {
  novelId: string;
  chapters: ChapterListItem[];
}

export default function ReaderChapterList({ novelId, chapters }: ReaderChapterListProps) {
  if (chapters.length === 0) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
        <FileText className="mb-4 h-12 w-12 text-zinc-600" />
        <p className="text-zinc-400">아직 등록된 회차가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {chapters.map((chapter) => {
        const date = chapter.publishedAt || chapter.createdAt;

        return (
          <Link
            key={chapter.id}
            href={`/novels/${novelId}/${chapter.id}`}
            className="flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-background-tertiary"
          >
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <span className="w-14 shrink-0 text-center text-sm font-semibold text-accent">{chapter.chapterNumber}화</span>
              <div className="min-w-0 flex-1">
                <h4 className="truncate font-medium text-white">{chapter.title}</h4>
                <p className="mt-1 text-xs text-zinc-500">
                  {formatDistanceToNow(new Date(date), { addSuffix: true, locale: ko })}
                </p>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-xs text-zinc-500">
              <Eye className="h-4 w-4" />
              {chapter.viewCount.toLocaleString()}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
