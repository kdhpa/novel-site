'use client';

import { useState } from 'react';
import NovelCard from './NovelCard';
import type { NovelListItem, Genre, Status } from '@/types';
import { GenreLabels, StatusLabels } from '@/types';

interface NovelListProps {
  novels: NovelListItem[];
  showFilters?: boolean;
}

export default function NovelList({ novels, showFilters = true }: NovelListProps) {
  const [selectedGenre, setSelectedGenre] = useState<Genre | ''>('');
  const [selectedStatus, setSelectedStatus] = useState<Status | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter novels
  const filteredNovels = novels.filter((novel) => {
    if (selectedGenre && novel.genre !== selectedGenre) return false;
    if (selectedStatus && novel.status !== selectedStatus) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        novel.title.toLowerCase().includes(query) ||
        novel.description?.toLowerCase().includes(query) ||
        novel.author.nickname?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const genres: Genre[] = ['FANTASY', 'ROMANCE', 'SF', 'MARTIAL_ARTS', 'MYSTERY', 'HORROR', 'MODERN', 'OTHER'];
  const statuses: Status[] = ['ONGOING', 'COMPLETED', 'HIATUS'];

  return (
    <div>
      {showFilters && (
        <div className="mb-6 space-y-4">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="작품 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            {/* Genre filter */}
            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value as Genre | '')}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">모든 장르</option>
              {genres.map((genre) => (
                <option key={genre} value={genre}>
                  {GenreLabels[genre]}
                </option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as Status | '')}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">모든 상태</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {StatusLabels[status]}
                </option>
              ))}
            </select>

            {/* Clear filters */}
            {(selectedGenre || selectedStatus || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedGenre('');
                  setSelectedStatus('');
                  setSearchQuery('');
                }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              >
                필터 초기화
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results count */}
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {filteredNovels.length}개의 작품
      </p>

      {/* Novel grid */}
      {filteredNovels.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredNovels.map((novel) => (
            <NovelCard key={novel.id} novel={novel} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <svg
            className="mx-auto w-12 h-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            검색 결과가 없습니다.
          </p>
        </div>
      )}
    </div>
  );
}
