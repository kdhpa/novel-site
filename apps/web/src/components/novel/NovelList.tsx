'use client';

import { useMemo, useState } from 'react';
import { BookOpen, Filter, RotateCcw, Search } from 'lucide-react';
import NovelCard from './NovelCard';
import type { Genre, NovelListItem, Status } from '@/types';
import { GenreLabels, StatusLabels } from '@/types';

interface NovelListProps {
  novels: NovelListItem[];
  showFilters?: boolean;
  initialGenre?: string;
  initialStatus?: string;
  initialSort?: string;
  initialSearch?: string;
}

const genres: Genre[] = ['FANTASY', 'ROMANCE', 'MARTIAL_ARTS', 'SF', 'MYSTERY', 'HORROR', 'MODERN', 'OTHER'];
const statuses: Status[] = ['ONGOING', 'COMPLETED', 'HIATUS'];
type SortKey = 'latest' | 'updated' | 'popular' | 'likes' | 'chapters';

export default function NovelList({
  novels,
  showFilters = true,
  initialGenre,
  initialStatus,
  initialSort,
  initialSearch = '',
}: NovelListProps) {
  const [selectedGenre, setSelectedGenre] = useState<Genre | ''>(genres.includes(initialGenre as Genre) ? initialGenre as Genre : '');
  const [selectedStatus, setSelectedStatus] = useState<Status | ''>(statuses.includes(initialStatus as Status) ? initialStatus as Status : '');
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [sortBy, setSortBy] = useState<SortKey>(['latest', 'updated', 'popular', 'likes', 'chapters'].includes(initialSort || '') ? initialSort as SortKey : 'latest');

  const filteredNovels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = novels.filter((novel) => {
      if (selectedGenre && !novel.genres.includes(selectedGenre)) return false;
      if (selectedStatus && novel.status !== selectedStatus) return false;
      if (!query) return true;
      return (
        novel.title.toLowerCase().includes(query) ||
        novel.description?.toLowerCase().includes(query) ||
        novel.author.nickname?.toLowerCase().includes(query)
      );
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'updated':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'popular':
          return b.viewCount - a.viewCount;
        case 'likes':
          return b._count.likes - a._count.likes;
        case 'chapters':
          return b._count.chapters - a._count.chapters;
        case 'latest':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  }, [novels, searchQuery, selectedGenre, selectedStatus, sortBy]);

  const resetFilters = () => {
    setSelectedGenre('');
    setSelectedStatus('');
    setSearchQuery('');
    setSortBy('latest');
  };

  return (
    <div>
      {showFilters && (
        <div className="mb-6 rounded-md border border-border bg-background-secondary">
          <div className="grid gap-3 border-b border-border p-4 lg:grid-cols-[minmax(0,1fr)_170px_170px] lg:items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="작품, 작가, 소개 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 w-full rounded-md border border-border bg-background-tertiary py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-600 outline-none transition-colors focus:border-primary"
              />
            </div>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as Status | '')}
              className="h-11 rounded-md border border-border bg-background-tertiary px-3 text-sm text-zinc-200 outline-none focus:border-primary"
              aria-label="연재 상태"
            >
              <option value="">모든 상태</option>
              {statuses.map((status) => (
                <option key={status} value={status}>{StatusLabels[status]}</option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="h-11 rounded-md border border-border bg-background-tertiary px-3 text-sm text-zinc-200 outline-none focus:border-primary"
              aria-label="정렬"
            >
              <option value="latest">신작순</option>
              <option value="updated">업데이트순</option>
              <option value="popular">조회순</option>
              <option value="likes">좋아요순</option>
              <option value="chapters">회차 많은순</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 p-4">
            <span className="flex min-h-8 items-center gap-1 text-xs font-medium text-zinc-500">
              <Filter className="h-3.5 w-3.5" /> 장르
            </span>
            <button
              type="button"
              onClick={() => setSelectedGenre('')}
              className={`min-h-8 rounded px-3 py-1.5 text-xs font-medium transition-colors ${selectedGenre === '' ? 'bg-primary text-white' : 'border border-border bg-background-tertiary text-zinc-400 hover:border-accent-muted hover:text-white'}`}
            >
              전체
            </button>
            {genres.map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => setSelectedGenre(selectedGenre === genre ? '' : genre)}
                className={`min-h-8 rounded px-3 py-1.5 text-xs font-medium transition-colors ${selectedGenre === genre ? 'bg-primary text-white' : 'border border-border bg-background-tertiary text-zinc-400 hover:border-accent-muted hover:text-white'}`}
              >
                {GenreLabels[genre]}
              </button>
            ))}
            {(selectedGenre || selectedStatus || searchQuery || sortBy !== 'latest') && (
              <button type="button" onClick={resetFilters} className="ml-auto flex min-h-8 items-center gap-1 rounded-md px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-background-tertiary hover:text-zinc-200">
                <RotateCcw className="h-3.5 w-3.5" /> 초기화
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between text-sm text-zinc-500">
        <span>총 {filteredNovels.length.toLocaleString()}개 작품</span>
        <span className="hidden sm:inline">카드를 눌러 상세 페이지로 이동</span>
      </div>

      {filteredNovels.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filteredNovels.map((novel, index) => (
            <NovelCard key={novel.id} novel={novel} showDescription rank={sortBy === 'popular' && index < 10 ? index + 1 : undefined} />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-background-secondary text-center">
          <BookOpen className="mb-4 h-12 w-12 text-zinc-600" />
          <p className="text-zinc-300">조건에 맞는 작품이 없습니다.</p>
          <p className="mt-1 text-sm text-zinc-500">검색어 또는 필터를 조정해 보세요.</p>
        </div>
      )}
    </div>
  );
}
