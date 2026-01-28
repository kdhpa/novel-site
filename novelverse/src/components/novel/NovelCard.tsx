'use client';

import Link from 'next/link';
import Image from 'next/image';
import { GenreBadge, StatusBadge } from '@/components/ui/Badge';
import type { NovelListItem } from '@/types';

interface NovelCardProps {
  novel: NovelListItem;
}

export default function NovelCard({ novel }: NovelCardProps) {
  return (
    <Link href={`/novels/${novel.id}`}>
      <div className="group bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow">
        {/* Cover Image */}
        <div className="relative aspect-[3/4] bg-gray-100 dark:bg-gray-700">
          {novel.coverImage ? (
            <Image
              src={novel.coverImage}
              alt={novel.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                className="w-16 h-16 text-gray-300 dark:text-gray-600"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          )}
          {/* Status badge overlay */}
          <div className="absolute top-2 right-2">
            <StatusBadge status={novel.status} />
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <GenreBadge genre={novel.genre} />
          </div>

          <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {novel.title}
          </h3>

          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {novel.author.nickname || '익명'}
          </p>

          {novel.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
              {novel.description}
            </p>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {novel._count.chapters}화
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {novel._count.likes}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {novel.viewCount}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
