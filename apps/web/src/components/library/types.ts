import type { Genre } from '@/types';

export const LIBRARY_TABS = ['history', 'bookmarks', 'likes', 'reviews'] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];

export const LIBRARY_PAGE_SIZE = 20;
export const LIBRARY_MAX_PAGE_SIZE = 50;

export function isLibraryTab(value: string | null | undefined): value is LibraryTab {
  return LIBRARY_TABS.includes(value as LibraryTab);
}

export function normalizeLibraryTab(value: string | null | undefined): LibraryTab {
  return isLibraryTab(value) ? value : 'history';
}

export function normalizeLibraryPage(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function normalizeLibraryLimit(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, LIBRARY_MAX_PAGE_SIZE)
    : LIBRARY_PAGE_SIZE;
}

export interface LibraryNovelData {
  id: string;
  title: string;
  coverImage: string | null;
  genres: Genre[];
  status: string;
  author: {
    nickname: string | null;
  };
  _count: {
    chapters: number;
    likes: number;
  };
}

export interface LibraryItem {
  id: string;
  novel: LibraryNovelData;
  lastChapter?: number;
  continueChapterId?: string | null;
  updatedAt?: string;
  createdAt?: string;
  rating?: number;
  contentPreview?: string;
}

export interface LibraryPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface LibraryPageData {
  tab: LibraryTab;
  items: LibraryItem[];
  pagination: LibraryPagination;
}
