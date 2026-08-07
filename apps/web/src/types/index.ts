// TypeScript type definitions for NovelVerse

import type {
  User as PrismaUser,
  Novel as PrismaNovel,
  Chapter as PrismaChapter,
  Comment as PrismaComment,
  Review as PrismaReview,
  Tag as PrismaTag,
  Character as PrismaCharacter,
  Season as PrismaSeason,
} from '@novelverse/db/browser';

import {
  Role,
  Genre,
  Status,
  ApprovalStatus,
} from '@novelverse/db/browser';

import 'next-auth';
import 'next-auth/jwt';

export { Role, Genre, Status, ApprovalStatus };

export type {
  IllustrationStatus,
  IllustrationPosition,
  ChapterIllustration,
  GeneratedIllustration,
  IllustrationSettings,
  IllustrationCharacter,
  AnalyzeChapterRequest,
  AnalyzeChapterResponse,
  GenerateInlineIllustrationsRequest,
  GenerateInlineIllustrationsResponse,
} from './illustration';

export {
  DEFAULT_ILLUSTRATION_SETTINGS,
  ILLUSTRATION_MARKERS,
} from './illustration';

export type User = PrismaUser & {
  novels?: Novel[];
  bookmarks?: Bookmark[];
  likes?: Like[];
  reviews?: Review[];
  comments?: Comment[];
};

export type SafeUser = Omit<PrismaUser,
  | 'password'
  | 'passwordChangedAt'
  | 'emailVerified'
  | 'emailNormalized'
  | 'nicknameNormalized'
  | 'suspendedAt'
  | 'suspensionReason'
>;

export type Novel = PrismaNovel & {
  author?: SafeUser;
  chapters?: Chapter[];
  tags?: TagWithTag[];
  characters?: Character[];
  reviews?: Review[];
  season?: Season | null;
  _count?: {
    chapters?: number;
    bookmarks?: number;
    likes?: number;
    reviews?: number;
    comments?: number;
    characters?: number;
  };
};

export type Season = PrismaSeason & {
  novels?: Novel[];
};

export type SeasonOption = {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

export type Character = PrismaCharacter & {
  novel?: Novel;
};

export type CharacterListItem = Pick<PrismaCharacter,
  'id' | 'name' | 'role' | 'portraitUrl' | 'appearance' | 'createdAt'
>;

export type NovelListItem = Pick<PrismaNovel,
  'id' | 'title' | 'description' | 'coverImage' | 'genres' | 'status' | 'viewCount' | 'createdAt' | 'updatedAt'
> & {
  author: Pick<PrismaUser, 'id' | 'nickname' | 'image'>;
  _count: {
    chapters: number;
    likes: number;
    reviews?: number;
  };
};

export type Chapter = PrismaChapter & {
  novel?: Novel;
};

export type ChapterListItem = Pick<PrismaChapter,
  'id' | 'chapterNumber' | 'title' | 'isPublished' | 'publishedAt' | 'createdAt' | 'viewCount'
>;

export type Comment = PrismaComment & {
  user?: SafeUser;
  replies?: Comment[];
  parent?: Comment;
};

export type Review = PrismaReview & {
  novel?: Novel;
  user?: SafeUser;
};

export type ReviewListItem = Pick<PrismaReview,
  'id' | 'rating' | 'content' | 'hasSpoiler' | 'createdAt' | 'updatedAt'
> & {
  user: Pick<PrismaUser, 'id' | 'nickname' | 'image'>;
};

export type TagWithTag = {
  tag: PrismaTag;
};

export type Bookmark = {
  id: string;
  userId: string;
  novelId: string;
  createdAt: Date;
  novel?: Novel;
  user?: SafeUser;
};

export type Like = {
  id: string;
  userId: string;
  novelId: string;
  createdAt: Date;
  novel?: Novel;
  user?: SafeUser;
};

export type ReadingHistory = {
  id: string;
  lastChapter: number;
  updatedAt: Date;
  userId: string;
  novelId: string;
  novel?: Novel;
  user?: SafeUser;
};

export type AuthorRankingItem = {
  id: string;
  nickname: string | null;
  image: string | null;
  bio: string | null;
  totalViewCount: number;
  novelCount: number;
};

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

export type NovelFormInput = {
  title: string;
  description?: string | null;
  genres: Genre[];
  status?: Status;
  coverImage?: string | null;
  tags?: string[];
  isPublished?: boolean;
  seasonId?: string | null;
};

export type ChapterFormInput = {
  title: string;
  content: string;
  chapterNumber?: number;
  aiImage?: string | null;
  aiImagePrompt?: string | null;
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

export type CharacterFormInput = {
  name: string;
  description?: string | null;
  appearance: string;
  personality?: string | null;
  role?: string | null;
  portraitUrl?: string | null;
  portraitPrompt?: string | null;
};

export type ReviewFormInput = {
  rating: number;
  content: string;
  hasSpoiler?: boolean;
};

export type AIImageRequest = {
  prompt: string;
  negativePrompt?: string;
  style?: 'anime' | 'realistic' | 'fantasy' | 'watercolor';
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3';
  seed?: number;
};

export type AIImageResponse = {
  imageUrl: string;
  prompt: string;
};

export type AIPortraitRequest = {
  characterId: string;
  appearance: string;
  style?: 'anime' | 'realistic' | 'fantasy' | 'watercolor';
  genre?: Genre;
};

export type AIPortraitResponse = {
  imageUrl: string;
  prompt: string;
};

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

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      nickname?: string | null;
      image?: string | null;
      role: Role;
      isVerifiedAuthor?: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    nickname?: string | null;
    image?: string | null;
    role: Role;
    isVerifiedAuthor?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    sessionIssuedAt?: number;
    email: string;
    name?: string | null;
    nickname?: string | null;
    image?: string | null;
    role: Role;
    isVerifiedAuthor?: boolean;
  }
}

export const GenreLabels: Record<Genre, string> = {
  FANTASY: '\uD310\uD0C0\uC9C0',
  ROMANCE: '\uB85C\uB9E8\uC2A4',
  SF: 'SF',
  MARTIAL_ARTS: '\uBB34\uD611',
  MYSTERY: '\uBBF8\uC2A4\uD130\uB9AC',
  HORROR: '\uD638\uB7EC',
  MODERN: '\uD604\uB300',
  OTHER: '\uAE30\uD0C0',
};

export const StatusLabels: Record<Status, string> = {
  ONGOING: '\uC5F0\uC7AC \uC911',
  COMPLETED: '\uC644\uACB0',
  HIATUS: '\uD734\uC7AC',
};

export const RoleLabels: Record<Role, string> = {
  USER: '\uC0AC\uC6A9\uC790',
  AUTHOR: '\uC791\uAC00',
  ADMIN: '\uAD00\uB9AC\uC790',
};

export const ApprovalStatusLabels: Record<ApprovalStatus, string> = {
  DRAFT: '\uC784\uC2DC \uC800\uC7A5',
  PENDING_REVIEW: '\uC2EC\uC0AC \uB300\uAE30',
  APPROVED: '\uC2B9\uC778\uB428',
  REJECTED: '\uBC18\uB824\uB428',
};

export const CharacterRoles = [
  { value: 'protagonist', label: '\uC8FC\uC778\uACF5' },
  { value: 'antagonist', label: '\uC801\uB300\uC790' },
  { value: 'supporting', label: '\uC870\uC5F0' },
  { value: 'mentor', label: '\uBA58\uD1A0' },
  { value: 'love_interest', label: '\uB7EC\uBE0C \uC778\uD130\uB808\uC2A4\uD2B8' },
  { value: 'sidekick', label: '\uC870\uB825\uC790' },
  { value: 'other', label: '\uAE30\uD0C0' },
] as const;

export type CharacterRoleType = typeof CharacterRoles[number]['value'];

export type CoverStyle = 'anime' | 'realistic' | 'fantasy' | 'watercolor';
export type CoverMood = 'mystical' | 'dark' | 'bright' | 'romantic' | 'action' | 'calm';

export interface CoverGenerationOptions {
  style: CoverStyle;
  mood: CoverMood;
  useCustomPrompt: boolean;
  customPrompt?: string;
}

export interface CoverHistoryItem {
  id: string;
  imageUrl: string;
  prompt: string;
  style: CoverStyle;
  createdAt: string;
  source: 'ai' | 'upload' | 'url';
}

export const CoverStyleLabels: Record<CoverStyle, string> = {
  anime: '\uC560\uB2C8\uBA54\uC774\uC158',
  realistic: '\uC2E4\uC0AC\uD48D',
  fantasy: '\uD310\uD0C0\uC9C0 \uC544\uD2B8',
  watercolor: '\uC218\uCC44\uD654',
};

export const CoverMoodLabels: Record<CoverMood, string> = {
  mystical: '\uC2E0\uBE44\uB85C\uC6B4',
  dark: '\uC5B4\uB450\uC6B4',
  bright: '\uBC1D\uC740',
  romantic: '\uB85C\uB9E8\uD2F1',
  action: '\uC561\uC158',
  calm: '\uCC28\uBD84\uD55C',
};
