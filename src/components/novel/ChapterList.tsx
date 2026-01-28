'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { ChapterListItem } from '@/types';

interface ChapterListProps {
  novelId: string;
  chapters: ChapterListItem[];
  isAuthor?: boolean;
}

export default function ChapterList({ novelId, chapters, isAuthor = false }: ChapterListProps) {
  if (chapters.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <svg
          className="mx-auto w-12 h-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="mt-4 text-gray-500 dark:text-gray-400">
          아직 등록된 회차가 없습니다.
        </p>
        {isAuthor && (
          <Link
            href={`/novels/${novelId}/chapters/new`}
            className="inline-block mt-4 text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            첫 회차 작성하기
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      {chapters.map((chapter) => (
        <Link
          key={chapter.id}
          href={
            isAuthor
              ? `/novels/${novelId}/chapters/${chapter.id}/edit`
              : `/novels/${novelId}/${chapter.id}`
          }
          className="flex items-center justify-between py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 px-4 -mx-4 transition-colors"
        >
          <div className="flex items-center gap-4">
            <span className="text-lg font-medium text-gray-500 dark:text-gray-400 w-12">
              {chapter.chapterNumber}화
            </span>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">
                {chapter.title}
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {chapter.publishedAt
                  ? formatDistanceToNow(new Date(chapter.publishedAt), {
                      addSuffix: true,
                      locale: ko,
                    })
                  : formatDistanceToNow(new Date(chapter.createdAt), {
                      addSuffix: true,
                      locale: ko,
                    })}
                {!chapter.isPublished && (
                  <span className="ml-2 text-yellow-600 dark:text-yellow-400">
                    (미발행)
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {chapter.viewCount}
          </div>
        </Link>
      ))}
    </div>
  );
}
