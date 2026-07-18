import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { headers } from 'next/headers';
import { cache } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, Bookmark, Eye, FileText, Heart, PenLine, Star, UserRound } from 'lucide-react';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import ReaderChapterList from '@/components/novel/ReaderChapterList';
import NovelActions from '@/components/novel/NovelActions';
import ReviewSection from '@/components/novel/ReviewSection';
import CommentSection from '@/components/novel/CommentSection';
import Badge, { ApprovalStatusBadge, GenreBadge, StatusBadge } from '@/components/ui/Badge';
import { GenreLabels } from '@/types';
import type { Genre } from '@/types';
import type { Metadata } from 'next';
import type { Prisma } from '@novelverse/db/client';
import { isOptimizableImageSource } from '@/lib/image-hosts';
import ServerPagination from '@/components/ui/ServerPagination';
import JsonLd from '@/components/seo/JsonLd';
import { absoluteUrl, DEFAULT_SOCIAL_IMAGE, SITE_NAME } from '@/lib/site';
import { isCurrentAdmin } from '@/lib/server/authz';
import { recordUniqueContentView } from '@/lib/server/content-view';
import { logServerError } from '@novelverse/shared';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

const CHAPTER_PAGE_SIZE = 30;

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const novel = await getPublicNovel(id, 1);
  if (!novel) return { title: '작품을 찾을 수 없습니다' };
  const title = novel.title;
  const description = novel.description || `${novel.title} - NovelVerse에서 읽기`;
  const path = `/novels/${id}`;
  const images = novel.coverImage
    ? [{ url: novel.coverImage, alt: `${novel.title} 표지` }]
    : [{ url: DEFAULT_SOCIAL_IMAGE, alt: 'NovelVerse 웹소설 플랫폼' }];

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'book',
      url: path,
      locale: 'ko_KR',
      siteName: SITE_NAME,
      title,
      description,
      images,
      authors: [novel.author.nickname || '익명 작가'],
      tags: novel.genres.map((genre) => GenreLabels[genre as Genre]),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: images.map((image) => image.url),
    },
  };
}

function getNovelInclude(page: number) {
  return {
    author: { select: { id: true, nickname: true, image: true, bio: true } },
    chapters: {
      where: { isPublished: true },
      skip: (page - 1) * CHAPTER_PAGE_SIZE,
      take: CHAPTER_PAGE_SIZE,
      orderBy: { chapterNumber: 'asc' as const },
      select: { id: true, chapterNumber: true, title: true, isPublished: true, publishedAt: true, createdAt: true, viewCount: true },
    },
    tags: { include: { tag: true } },
    characters: { take: 6, orderBy: { createdAt: 'asc' as const }, select: { id: true, name: true, role: true, portraitUrl: true } },
    _count: { select: { chapters: { where: { isPublished: true } }, bookmarks: true, likes: true, characters: true } },
  } satisfies Prisma.NovelInclude;
}

const getPublicNovel = cache(
  async (id: string, page: number) => prisma.novel.findFirst({
    where: { id, isPublished: true, approvalStatus: 'APPROVED' },
    include: getNovelInclude(page),
  }),
);

async function getPreviewNovel(id: string, page: number, user: { id: string; isAdmin: boolean }) {
  return prisma.novel.findFirst({
    where: user.isAdmin ? { id } : { id, authorId: user.id },
    include: getNovelInclude(page),
  });
}

export default async function NovelDetailPage({ params, searchParams }: PageProps) {
  const sessionPromise = auth();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const page = parsePage(query.page);
  const reviewSummaryPromise = prisma.review.aggregate({
    where: { novelId: id, isHidden: false },
    _count: { _all: true },
    _avg: { rating: true },
  });
  const [publicNovel, session, reviewSummary] = await Promise.all([
    getPublicNovel(id, page),
    sessionPromise,
    reviewSummaryPromise,
  ]);
  const isAdmin = session?.user ? await isCurrentAdmin(session.user.id) : false;
  const novel = publicNovel || (session?.user
    ? await getPreviewNovel(id, page, { id: session.user.id, isAdmin })
    : null);

  if (!novel) notFound();

  const isAuthor = session?.user?.id === novel.authorId;

  const [initialBookmark, initialLike, history] = session?.user
    ? await Promise.all([
        prisma.bookmark.findUnique({ where: { userId_novelId: { userId: session.user.id, novelId: id } }, select: { id: true } }),
        prisma.like.findUnique({ where: { userId_novelId: { userId: session.user.id, novelId: id } }, select: { id: true } }),
        prisma.readingHistory.findUnique({ where: { userId_novelId: { userId: session.user.id, novelId: id } }, select: { lastChapter: true } }),
      ])
    : await Promise.all([
        Promise.resolve(null),
        Promise.resolve(null),
        Promise.resolve(null),
      ]);

  const historyChapterOnPage = history
    ? novel.chapters.find((chapter) => chapter.chapterNumber === history.lastChapter)
    : null;
  const historyChapter = history && !historyChapterOnPage
    ? await prisma.chapter.findFirst({
        where: { novelId: id, chapterNumber: history.lastChapter, isPublished: true },
        select: { id: true, chapterNumber: true },
      })
    : historyChapterOnPage;
  const continueChapter = historyChapter || novel.chapters[0];
  const chapterTotalPages = Math.max(1, Math.ceil(novel._count.chapters / CHAPTER_PAGE_SIZE));
  const reviewTotal = reviewSummary._count._all;
  const averageRating = reviewSummary._avg.rating || 0;
  const isPublic = Boolean(publicNovel);
  const novelUrl = absoluteUrl(`/novels/${id}`);
  const authorName = novel.author.nickname || '익명 작가';
  const bookJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: novel.title,
    description: novel.description || `${novel.title} - NovelVerse에서 읽기`,
    url: novelUrl,
    inLanguage: 'ko',
    author: {
      '@type': 'Person',
      name: authorName,
      url: absoluteUrl(`/authors/${novel.author.id}`),
    },
    genre: novel.genres.map((genre: Genre) => GenreLabels[genre]),
    dateCreated: novel.createdAt.toISOString(),
    dateModified: novel.updatedAt.toISOString(),
    numberOfPages: novel._count.chapters,
    ...(novel.coverImage && { image: novel.coverImage }),
    ...(reviewTotal > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: Number(averageRating.toFixed(1)),
        ratingCount: reviewTotal,
        bestRating: 5,
        worstRating: 1,
      },
    }),
  };
  const breadcrumbJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: '웹소설', item: absoluteUrl('/novels') },
      { '@type': 'ListItem', position: 3, name: novel.title, item: novelUrl },
    ],
  };

  if (novel.isPublished && novel.approvalStatus === 'APPROVED' && !isAuthor && !isAdmin) {
    const requestHeaders = await headers();
    after(async () => {
      try {
        await recordUniqueContentView({
          targetType: 'novel',
          targetId: id,
          userId: session?.user?.id,
          headers: requestHeaders,
        });
      } catch (error) {
        logServerError('content-view.novel', error, { novelId: id });
      }
    });
  }

  return (
    <div className="min-h-screen bg-background">
      {isPublic && (
        <>
          <JsonLd data={bookJsonLd} />
          <JsonLd data={breadcrumbJsonLd} />
        </>
      )}
      <section className="border-b border-border bg-background-secondary/30">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-7 md:grid-cols-[220px_1fr]">
            <div className="mx-auto w-44 md:mx-0 md:w-full">
              <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-background-tertiary">
                {novel.coverImage ? (
                  <Image src={novel.coverImage} alt={novel.title} fill priority sizes="(min-width: 768px) 220px, 176px" unoptimized={!isOptimizableImageSource(novel.coverImage)} className="object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-zinc-600"><BookOpen className="h-16 w-16" /></div>
                )}
              </div>
            </div>

            <div className="min-w-0 text-center md:text-left">
              <div className="mb-3 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                {novel.genres.length > 0 ? novel.genres.map((genre: Genre) => <GenreBadge key={genre} genre={genre} />) : <Badge>기타</Badge>}
                <StatusBadge status={novel.status} />
                {novel.approvalStatus !== 'APPROVED' && <ApprovalStatusBadge status={novel.approvalStatus} />}
              </div>

              <h1 className="text-3xl font-bold leading-tight text-white md:text-4xl">{novel.title}</h1>
              <Link href={`/authors/${novel.author.id}`} className="mt-3 inline-flex items-center gap-2 text-zinc-400 transition-colors hover:text-accent">
                <UserRound className="h-4 w-4" /> {novel.author.nickname || '익명 작가'} 작가
              </Link>

              <div className="mt-5 grid grid-cols-2 gap-3 text-center sm:grid-cols-5 md:max-w-3xl md:text-left">
                <Stat label="회차" value={`${novel._count.chapters}화`} icon={<FileText className="h-4 w-4" />} />
                <Stat label="조회" value={novel.viewCount.toLocaleString()} icon={<Eye className="h-4 w-4" />} />
                <Stat label="좋아요" value={novel._count.likes.toLocaleString()} icon={<Heart className="h-4 w-4" />} />
                <Stat label="북마크" value={novel._count.bookmarks.toLocaleString()} icon={<Bookmark className="h-4 w-4" />} />
                <Stat label="평점" value={reviewTotal > 0 ? averageRating.toFixed(1) : '-'} icon={<Star className="h-4 w-4" />} />
              </div>

              {novel.tags.length > 0 && (
                <div className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
                  {novel.tags.map(({ tag }) => (
                    <Link key={tag.id} href={`/novels?tag=${encodeURIComponent(tag.name)}`} className="rounded-md border border-border bg-background-tertiary px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-accent-muted hover:text-white">
                      #{tag.name}
                    </Link>
                  ))}
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 md:justify-start">
                {continueChapter && (
                  <Link href={`/novels/${id}/${continueChapter.id}`} className="rounded-md bg-primary px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover">
                    {history ? `${continueChapter.chapterNumber}화 이어보기` : '첫 화 보기'}
                  </Link>
                )}
                <NovelActions novelId={id} initialLiked={Boolean(initialLike)} initialBookmarked={Boolean(initialBookmark)} initialLikeCount={novel._count.likes} />
                {isAuthor && (
                  <Link href={`/novels/${id}/edit`} className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-sm font-semibold text-zinc-300 transition-colors hover:border-accent-muted hover:bg-background-tertiary">
                    <PenLine className="h-4 w-4" /> 작품 수정
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="sticky top-[125px] z-20 border-b border-border bg-background xl:top-[69px]">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {['소개', '회차', '리뷰', isPublic ? '댓글' : null, novel._count.characters > 0 ? '캐릭터' : null].filter(Boolean).map((label) => (
            <a key={label} href={`#${label}`} className="shrink-0 px-5 py-4 text-sm font-semibold text-zinc-400 transition-colors hover:text-white first:text-accent">
              {label}
            </a>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <section id="소개" className="mb-8 scroll-mt-[190px] rounded-md border border-border bg-background-secondary p-5 xl:scroll-mt-[134px]">
          <h2 className="mb-3 text-lg font-bold text-white">작품 소개</h2>
          <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-300">{novel.description || '작품 소개가 아직 등록되지 않았습니다.'}</p>
        </section>

        <section id="회차" className="mb-8 scroll-mt-[190px] overflow-hidden rounded-md border border-border bg-background-secondary xl:scroll-mt-[134px]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-bold text-white">전체 {novel._count.chapters}화</h2>
            <span className="text-sm text-zinc-500">오래된 순</span>
          </div>
          <ReaderChapterList novelId={id} chapters={novel.chapters} />
          <div className="px-4 pb-5">
            <ServerPagination pathname={`/novels/${id}`} page={page} totalPages={chapterTotalPages} />
          </div>
        </section>

        {novel.characters.length > 0 && (
          <section id="캐릭터" className="mb-8 scroll-mt-[190px] rounded-md border border-border bg-background-secondary p-5 xl:scroll-mt-[134px]">
            <h2 className="mb-4 text-lg font-bold text-white">캐릭터</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
              {novel.characters.map((character) => (
                <div key={character.id} className="text-center">
                  <div className="relative mx-auto mb-2 h-20 w-20 overflow-hidden rounded-md bg-background-tertiary">
                    {character.portraitUrl ? <Image src={character.portraitUrl} alt={character.name} fill sizes="80px" unoptimized={!isOptimizableImageSource(character.portraitUrl)} className="object-cover" /> : <UserRound className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-zinc-600" />}
                  </div>
                  <p className="line-clamp-1 text-sm font-semibold text-white">{character.name}</p>
                  {character.role && <p className="line-clamp-1 text-xs text-zinc-500">{character.role}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        <section id="리뷰" className="mb-8 scroll-mt-[190px] xl:scroll-mt-[134px]">
          <ReviewSection novelId={id} initialAverageRating={averageRating} initialTotal={reviewTotal} />
        </section>

        {isPublic && <CommentSection novelId={id} />}

      </main>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-background-secondary p-3">
      <div className="mb-1 flex items-center justify-center gap-1 text-zinc-500 md:justify-start">{icon}<span className="text-xs">{label}</span></div>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  );
}
