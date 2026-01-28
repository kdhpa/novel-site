// TypeScript type definitions for NovelVerse

import type {
  User as PrismaUser,
  Novel as PrismaNovel,
  Chapter as PrismaChapter,
  Comment as PrismaComment,
  Tag as PrismaTag,
} from '@/generated/prisma/client';

import {
  Role,
  Genre,
  Status
} from '@/generated/prisma/client';

// Re-export Prisma enums
export { Role, Genre, Status };

// Extended User type with relations
export type User = PrismaUser & {
  novels?: Novel[];
  bookmarks?: Bookmark[];
  likes?: Like[];
  comments?: Comment[];
};

// User without sensitive data
export type SafeUser = Omit<PrismaUser, 'password' | 'emailVerified'>;

// Extended Novel type with relations
export type Novel = PrismaNovel & {
  author?: SafeUser;
  chapters?: Chapter[];
  tags?: TagWithTag[];
  _count?: {
    chapters: number;
    bookmarks: number;
    likes: number;
    comments: number;
  };
};

// Novel for list display
export type NovelListItem = Pick<PrismaNovel,
  'id' | 'title' | 'description' | 'coverImage' | 'genre' | 'status' | 'viewCount' | 'createdAt'
> & {
  author: Pick<PrismaUser, 'id' | 'nickname' | 'image'>;
  _count: {
    chapters: number;
    likes: number;
  };
};

// Extended Chapter type
export type Chapter = PrismaChapter & {
  novel?: Novel;
};

// Chapter for list display
export type ChapterListItem = Pick<PrismaChapter,
  'id' | 'chapterNumber' | 'title' | 'isPublished' | 'publishedAt' | 'createdAt' | 'viewCount'
>;

// Extended Comment type with relations
export type Comment = PrismaComment & {
  user?: SafeUser;
  replies?: Comment[];
  parent?: Comment;
};

// Tag with relation
export type TagWithTag = {
  tag: PrismaTag;
};

// Bookmark type
export type Bookmark = {
  id: string;
  userId: string;
  novelId: string;
  createdAt: Date;
  novel?: Novel;
  user?: SafeUser;
};

// Like type
export type Like = {
  id: string;
  userId: string;
  novelId: string;
  createdAt: Date;
  novel?: Novel;
  user?: SafeUser;
};

// API Response types
export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

export type PaginatedResponse<T> = ApiResponse<{
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}>;

// Form input types
export type NovelFormInput = {
  title: string;
  description?: string;
  genre: Genre;
  status?: Status;
  coverImage?: string;
  tags?: string[];
  isPublished?: boolean;
};

export type ChapterFormInput = {
  title: string;
  content: string;
  chapterNumber?: number;
  aiImage?: string;
  aiImagePrompt?: string;
  isPublished?: boolean;
};

export type RegisterInput = {
  email: string;
  password: string;
  nickname: string;
  name?: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type CommentInput = {
  content: string;
  parentId?: string;
};

// AI Image generation types
export type AIImageRequest = {
  prompt: string;
  negativePrompt?: string;
  style?: 'anime' | 'realistic' | 'fantasy' | 'watercolor';
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3';
};

export type AIImageResponse = {
  imageUrl: string;
  prompt: string;
};

// Search and filter types
export type NovelFilters = {
  genre?: Genre;
  status?: Status;
  search?: string;
  authorId?: string;
  isPublished?: boolean;
};

export type SortOption = {
  field: 'createdAt' | 'updatedAt' | 'viewCount' | 'title';
  direction: 'asc' | 'desc';
};

// NextAuth extended types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      nickname?: string | null;
      image?: string | null;
      role: Role;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    nickname?: string | null;
    image?: string | null;
    role: Role;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    name?: string | null;
    nickname?: string | null;
    image?: string | null;
    role: Role;
  }
}

// Genre labels in Korean
export const GenreLabels: Record<Genre, string> = {
  FANTASY: '판타지',
  ROMANCE: '로맨스',
  SF: 'SF',
  MARTIAL_ARTS: '무협',
  MYSTERY: '미스터리',
  HORROR: '호러',
  MODERN: '현대',
  OTHER: '기타',
};

// Status labels in Korean
export const StatusLabels: Record<Status, string> = {
  ONGOING: '연재중',
  COMPLETED: '완결',
  HIATUS: '휴재',
};

// Role labels in Korean
export const RoleLabels: Record<Role, string> = {
  USER: '독자',
  AUTHOR: '작가',
  ADMIN: '관리자',
};
