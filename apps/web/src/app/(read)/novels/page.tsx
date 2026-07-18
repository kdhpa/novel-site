import Link from 'next/link';
import { BookOpen, ChevronLeft, ChevronRight, Filter, RotateCcw, Search } from 'lucide-react';
import prisma from '@/lib/prisma';
import NovelCard from '@/components/novel/NovelCard';
import type { Genre, NovelListItem, Status } from '@/types';
import { GenreLabels, StatusLabels } from '@/types';
import type { Metadata } from 'next';
import type { Prisma } from '@novelverse/db/client';
import { DEFAULT_SOCIAL_IMAGE, SITE_NAME } from '@/lib/site';
import { normalizeTagKey } from '@novelverse/shared';

const PAGE_SIZE = 24;
const validGenres: Genre[] = ['ROMANCE', 'FANTASY', 'MARTIAL_ARTS', 'SF', 'MYSTERY', 'HORROR', 'MODERN', 'OTHER'];
const validStatuses: Status[] = ['ONGOING', 'COMPLETED', 'HIATUS'];
const validSorts = ['latest', 'updated', 'popular', 'likes', 'chapters'] as const;
type SortOption = (typeof validSorts)[number];

interface PageProps {
  searchParams: Promise<BrowseParams>;
}

interface BrowseParams {
  genre?: string;
  status?: string;
  sort?: string;
  search?: string;
  tag?: string;
  page?: string;
}

interface NormalizedBrowseParams {
  genre?: Genre;
  status?: Status;
  sort: SortOption;
  search?: string;
  tag?: string;
  page: number;
}

interface BrowseResult {
  novels: NovelListItem[];
  total: number;
}

function normalizeBrowseParams(params: BrowseParams): NormalizedBrowseParams {
  const page = Number(params.page);
  const search = params.search?.trim().slice(0, 80);
  const tag = params.tag?.trim().slice(0, 80);

  return {
    genre: params.genre && validGenres.includes(params.genre as Genre) ? params.genre as Genre : undefined,
    status: params.status && validStatuses.includes(params.status as Status) ? params.status as Status : undefined,
    sort: params.sort && validSorts.includes(params.sort as SortOption) ? params.sort as SortOption : 'latest',
    search: search || undefined,
    tag: tag || undefined,
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = normalizeBrowseParams(await searchParams);
  const titleParts: string[] = [];
  if (params.search) titleParts.push(`'${params.search}' 검색`);
  if (params.tag) titleParts.push(`#${params.tag}`);
  if (params.genre) titleParts.push(GenreLabels[params.genre]);
  if (params.status) titleParts.push(StatusLabels[params.status]);

  const title = titleParts.length ? `${titleParts.join(' · ')} 작품` : '웹소설 탐색';
  const description = '장르, 상태, 키워드, 인기 지표로 NovelVerse 작품을 탐색하세요.';

  return {
    title,
    description,
    alternates: { canonical: '/novels' },
    openGraph: {
      type: 'website',
      url: '/novels',
      locale: 'ko_KR',
      siteName: SITE_NAME,
      title,
      description,
      images: [{ url: DEFAULT_SOCIAL_IMAGE, alt: 'NovelVerse 웹소설 탐색' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [DEFAULT_SOCIAL_IMAGE],
    },
  };
}

function buildWhere(params: NormalizedBrowseParams): Prisma.NovelWhereInput {
  const where: Prisma.NovelWhereInput = {
    isPublished: true,
    approvalStatus: 'APPROVED',
    ...(params.genre && { genres: { has: params.genre } }),
    ...(params.status && { status: params.status }),
    ...(params.tag && {
      tags: {
        some: {
          tag: { normalizedName: normalizeTagKey(params.tag) },
        },
      },
    }),
  };

  if (params.search) {
    where.OR = [
      { title: { contains: params.search, mode: 'insensitive' } },
      { description: { contains: params.search, mode: 'insensitive' } },
      { author: { nickname: { contains: params.search, mode: 'insensitive' } } },
      { tags: { some: { tag: { name: { contains: params.search, mode: 'insensitive' } } } } },
    ];
  }

  return where;
}

function buildOrderBy(sort: SortOption): Prisma.NovelOrderByWithRelationInput[] {
  switch (sort) {
    case 'popular':
      return [{ viewCount: 'desc' }, { id: 'desc' }];
    case 'likes':
      return [{ likeCount: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];
    case 'chapters':
      return [{ chapters: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }];
    case 'updated':
      return [{ updatedAt: 'desc' }, { id: 'desc' }];
    case 'latest':
    default:
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}

async function queryNovels(params: NormalizedBrowseParams): Promise<BrowseResult> {
  const where = buildWhere(params);
  const [novels, total] = await Promise.all([
    prisma.novel.findMany({
      where,
      skip: (params.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: buildOrderBy(params.sort),
      select: {
        id: true,
        title: true,
        description: true,
        coverImage: true,
        genres: true,
        status: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, nickname: true, image: true } },
        _count: { select: { chapters: { where: { isPublished: true } }, likes: true } },
      },
    }),
    prisma.novel.count({ where }),
  ]);

  return { novels: novels as NovelListItem[], total };
}

function getNovels(params: NormalizedBrowseParams) {
  return queryNovels(params);
}

function buildBrowseHref(params: NormalizedBrowseParams, changes: Partial<NormalizedBrowseParams>) {
  const next = { ...params, ...changes };
  const query = new URLSearchParams();
  if (next.genre) query.set('genre', next.genre);
  if (next.status) query.set('status', next.status);
  if (next.sort !== 'latest') query.set('sort', next.sort);
  if (next.search) query.set('search', next.search);
  if (next.tag) query.set('tag', next.tag);
  if (next.page > 1) query.set('page', String(next.page));
  const value = query.toString();
  return value ? `/novels?${value}` : '/novels';
}

export default async function NovelsPage({ searchParams }: PageProps) {
  const params = normalizeBrowseParams(await searchParams);
  const { novels, total } = await getNovels(params);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const genreLabel = params.genre ? GenreLabels[params.genre] : null;
  const statusLabel = params.status ? StatusLabels[params.status] : null;

  const title = params.search
    ? `'${params.search}' 검색 결과`
    : params.tag
      ? `#${params.tag}`
      : genreLabel
        ? `${genreLabel} 웹소설`
        : statusLabel
          ? `${statusLabel} 작품`
          : '웹소설 탐색';

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 border-b border-border pb-5">
          <p className="mb-2 text-sm font-semibold text-accent">작품 탐색</p>
          <h1 className="text-3xl font-bold text-white">{title}</h1>
          <p className="mt-2 text-sm text-zinc-500">장르, 상태, 인기와 업데이트 기준으로 원하는 작품을 찾아보세요.</p>
        </div>

        <BrowseFilters params={params} />

        <div className="mb-4 flex items-center justify-between text-sm text-zinc-500">
          <span>총 {total.toLocaleString()}개 작품</span>
          <span className="hidden sm:inline">페이지당 {PAGE_SIZE}개</span>
        </div>

        {novels.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {novels.map((novel, index) => {
              const rank = params.sort === 'popular' ? (params.page - 1) * PAGE_SIZE + index + 1 : undefined;
              return <NovelCard key={novel.id} novel={novel} showDescription rank={rank && rank <= 10 ? rank : undefined} />;
            })}
          </div>
        ) : (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-background-secondary text-center">
            <BookOpen className="mb-4 h-12 w-12 text-zinc-600" />
            <p className="text-zinc-300">조건에 맞는 작품이 없습니다.</p>
            <p className="mt-1 text-sm text-zinc-500">검색어 또는 필터를 조정해 보세요.</p>
          </div>
        )}

        <BrowsePagination params={params} totalPages={totalPages} />
      </div>
    </div>
  );
}

function BrowseFilters({ params }: { params: NormalizedBrowseParams }) {
  const hasFilters = Boolean(params.genre || params.status || params.search || params.tag || params.sort !== 'latest');

  return (
    <div className="mb-6 rounded-md border border-border bg-background-secondary">
      <form action="/novels" className="grid gap-3 border-b border-border p-4 lg:grid-cols-[minmax(0,1fr)_170px_170px_auto] lg:items-center">
        {params.genre && <input type="hidden" name="genre" value={params.genre} />}
        {params.tag && <input type="hidden" name="tag" value={params.tag} />}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            name="search"
            defaultValue={params.search || ''}
            maxLength={80}
            placeholder="작품, 작가, 소개 검색"
            className="h-11 w-full rounded-md border border-border bg-background-tertiary py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-600 outline-none transition-colors focus:border-primary"
          />
        </div>
        <select name="status" defaultValue={params.status || ''} className="h-11 rounded-md border border-border bg-background-tertiary px-3 text-sm text-zinc-200 outline-none focus:border-primary" aria-label="연재 상태">
          <option value="">모든 상태</option>
          {validStatuses.map((status) => <option key={status} value={status}>{StatusLabels[status]}</option>)}
        </select>
        <select name="sort" defaultValue={params.sort} className="h-11 rounded-md border border-border bg-background-tertiary px-3 text-sm text-zinc-200 outline-none focus:border-primary" aria-label="정렬">
          <option value="latest">신작순</option>
          <option value="updated">업데이트순</option>
          <option value="popular">조회순</option>
          <option value="likes">좋아요순</option>
          <option value="chapters">회차 많은순</option>
        </select>
        <button type="submit" className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover">적용</button>
      </form>

      <div className="flex flex-wrap items-center gap-2 p-4">
        <span className="flex min-h-8 items-center gap-1 text-xs font-medium text-zinc-500"><Filter className="h-3.5 w-3.5" /> 장르</span>
        <Link href={buildBrowseHref(params, { genre: undefined, page: 1 })} className={`min-h-8 rounded px-3 py-1.5 text-xs font-medium transition-colors ${!params.genre ? 'bg-primary text-white' : 'border border-border bg-background-tertiary text-zinc-400 hover:border-accent-muted hover:text-white'}`}>전체</Link>
        {validGenres.map((genre) => (
          <Link key={genre} href={buildBrowseHref(params, { genre: params.genre === genre ? undefined : genre, page: 1 })} className={`min-h-8 rounded px-3 py-1.5 text-xs font-medium transition-colors ${params.genre === genre ? 'bg-primary text-white' : 'border border-border bg-background-tertiary text-zinc-400 hover:border-accent-muted hover:text-white'}`}>
            {GenreLabels[genre]}
          </Link>
        ))}
        {hasFilters && <Link href="/novels" className="ml-auto flex min-h-8 items-center gap-1 rounded-md px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-background-tertiary hover:text-zinc-200"><RotateCcw className="h-3.5 w-3.5" /> 초기화</Link>}
      </div>
    </div>
  );
}

function BrowsePagination({ params, totalPages }: { params: NormalizedBrowseParams; totalPages: number }) {
  if (totalPages <= 1) return null;
  const start = Math.max(1, params.page - 2);
  const end = Math.min(totalPages, params.page + 2);
  const pages = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="작품 목록 페이지">
      {params.page > 1 && <Link href={buildBrowseHref(params, { page: params.page - 1 })} className="inline-flex h-10 items-center gap-1 rounded-md border border-border px-3 text-sm text-zinc-300 hover:border-accent-muted hover:text-white"><ChevronLeft className="h-4 w-4" /> 이전</Link>}
      {pages.map((page) => (
        <Link key={page} href={buildBrowseHref(params, { page })} aria-current={page === params.page ? 'page' : undefined} className={`inline-flex h-10 min-w-10 items-center justify-center rounded-md border px-3 text-sm font-semibold ${page === params.page ? 'border-primary bg-primary text-white' : 'border-border text-zinc-400 hover:border-accent-muted hover:text-white'}`}>
          {page}
        </Link>
      ))}
      {params.page < totalPages && <Link href={buildBrowseHref(params, { page: params.page + 1 })} className="inline-flex h-10 items-center gap-1 rounded-md border border-border px-3 text-sm text-zinc-300 hover:border-accent-muted hover:text-white">다음 <ChevronRight className="h-4 w-4" /></Link>}
    </nav>
  );
}
