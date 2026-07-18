import Link from 'next/link';
import prisma from '@/lib/prisma';
import type { Metadata } from 'next';
import Image from 'next/image';
import { auth } from '@/lib/auth';
import { HeroCarousel, NovelCarousel, RankingSection } from '@/components/home';
import type { Genre, NovelListItem } from '@/types';
import type { Prisma } from '@novelverse/db/client';
import { ArrowRight, BookOpen, CalendarDays, Eye, Heart, Library, Sparkles, Tags, Trophy } from 'lucide-react';
import { isOptimizableImageSource } from '@/lib/image-hosts';
import { DEFAULT_SOCIAL_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from '@/lib/site';

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    locale: 'ko_KR',
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: DEFAULT_SOCIAL_IMAGE, alt: 'NovelVerse 웹소설 플랫폼' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_SOCIAL_IMAGE],
  },
};

const novelSelect = {
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
};

const publishedWhere = { isPublished: true, approvalStatus: 'APPROVED' } satisfies Prisma.NovelWhereInput;
const HOME_HERO_IMAGE = '/images/home-hero-novelverse.png';

async function getNovels(
  orderBy: Prisma.NovelOrderByWithRelationInput | Prisma.NovelOrderByWithRelationInput[],
  take = 12,
  where: Prisma.NovelWhereInput = {}
): Promise<NovelListItem[]> {
  const novels = await prisma.novel.findMany({
    where: { ...publishedWhere, ...where },
    take,
    orderBy,
    select: novelSelect,
  });
  return novels as NovelListItem[];
}

async function getContinueReading(userId?: string) {
  if (!userId) return [];

  const history = await prisma.readingHistory.findMany({
    where: { userId, novel: publishedWhere },
    orderBy: { updatedAt: 'desc' },
    take: 6,
    include: { novel: { select: novelSelect } },
  });

  if (history.length === 0) return [];

  const chapters = await prisma.chapter.findMany({
    where: {
      OR: history.map((item) => ({ novelId: item.novelId, chapterNumber: item.lastChapter })),
      isPublished: true,
    },
    select: { id: true, novelId: true, chapterNumber: true },
  });
  const chapterMap = new Map(chapters.map((chapter) => [`${chapter.novelId}:${chapter.chapterNumber}`, chapter.id]));

  return history.map((item) => ({
    id: item.id,
    novel: item.novel as NovelListItem,
    lastChapter: item.lastChapter,
    chapterId: chapterMap.get(`${item.novelId}:${item.lastChapter}`) || null,
  }));
}

async function getTrendingTags() {
  return prisma.tag.findMany({
    where: { novels: { some: { novel: publishedWhere } } },
    take: 12,
    orderBy: { novels: { _count: 'desc' } },
    select: { id: true, name: true, _count: { select: { novels: { where: { novel: publishedWhere } } } } },
  });
}

async function getAuthorPicks(): Promise<NovelListItem[]> {
  return getNovels([{ viewCount: 'desc' }, { updatedAt: 'desc' }], 12);
}

async function getHomeRankingCandidates(): Promise<NovelListItem[]> {
  const [combinedIds, viewIds, likeIds] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT n.id
      FROM novels n
      WHERE n."isPublished" = true AND n."approvalStatus" = 'APPROVED'::"ApprovalStatus"
      ORDER BY (n."viewCount"::bigint + n."likeCount"::bigint * 10) DESC, n.id DESC
      LIMIT 10
    `,
    prisma.novel.findMany({
      where: publishedWhere,
      take: 10,
      orderBy: [{ viewCount: 'desc' }, { id: 'desc' }],
      select: { id: true },
    }),
    prisma.novel.findMany({
      where: publishedWhere,
      take: 10,
      orderBy: [{ likeCount: 'desc' }, { id: 'desc' }],
      select: { id: true },
    }),
  ]);
  const ids = [...new Set([...combinedIds, ...viewIds, ...likeIds].map((row) => row.id))];
  return prisma.novel.findMany({
    where: { ...publishedWhere, id: { in: ids } },
    select: novelSelect,
  }) as Promise<NovelListItem[]>;
}

async function getHomePublicData() {
    const [popularNovels, latestNovels, updatedNovels, completedNovels, romanceNovels, fantasyNovels, tags, authorPicks, rankingNovels] = await Promise.all([
      getNovels({ viewCount: 'desc' }, 20),
      getNovels({ createdAt: 'desc' }, 12),
      getNovels({ updatedAt: 'desc' }, 12),
      getNovels({ updatedAt: 'desc' }, 12, { status: 'COMPLETED' }),
      getNovels({ viewCount: 'desc' }, 12, { genres: { has: 'ROMANCE' as Genre } }),
      getNovels({ viewCount: 'desc' }, 12, { genres: { has: 'FANTASY' as Genre } }),
      getTrendingTags(),
      getAuthorPicks(),
      getHomeRankingCandidates(),
    ]);

    return {
      featuredNovels: popularNovels.slice(0, 5),
      popularNovels,
      latestNovels,
      updatedNovels,
      completedNovels,
      romanceNovels,
      fantasyNovels,
      tags,
      authorPicks,
      rankingNovels,
    };
}

export default async function HomePage() {
  const sessionPromise = auth();
  const continueReadingPromise = sessionPromise.then((session) => getContinueReading(session?.user?.id));
  const [publicData, continueReading] = await Promise.all([getHomePublicData(), continueReadingPromise]);
  const {
    featuredNovels,
    popularNovels,
    latestNovels,
    updatedNovels,
    completedNovels,
    romanceNovels,
    fantasyNovels,
    tags,
    authorPicks,
    rankingNovels,
  } = publicData;

  return (
    <div className="min-h-screen bg-background">
      {featuredNovels.length > 0 ? (
        <section className="relative isolate overflow-hidden border-b border-border bg-background">
          <Image
            src={HOME_HERO_IMAGE}
            alt=""
            fill
            priority
            sizes="100vw"
            className="home-hero-media absolute inset-0 -z-30 object-cover opacity-40"
          />
          <div className="absolute inset-0 -z-20 bg-gradient-to-r from-background via-background/90 to-background/60" />
          <div className="absolute inset-0 -z-20 bg-gradient-to-b from-background/40 via-background/70 to-background" />
          <div className="mx-auto max-w-7xl px-4 pb-5 pt-5 sm:px-6 sm:pb-7 sm:pt-7 lg:px-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="h-2 w-2 shrink-0 rounded-full bg-accent shadow-[0_0_18px_rgba(111,199,189,0.7)]" />
                <p className="truncate text-xs font-bold uppercase tracking-[0.16em] text-accent sm:tracking-[0.24em]">NovelVerse 주목작</p>
              </div>
              <div className="hidden items-center gap-2 text-xs font-semibold text-zinc-400 sm:flex">
                <span className="rounded-sm border border-white/10 bg-white/[0.04] px-2.5 py-1">실시간 인기</span>
                <span className="rounded-sm border border-white/10 bg-white/[0.04] px-2.5 py-1">신작 업데이트</span>
                <span className="rounded-sm border border-white/10 bg-white/[0.04] px-2.5 py-1">완결 정주행</span>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
              <HeroCarousel novels={featuredNovels} />
              <TopRankingPanel novels={popularNovels.slice(0, 6)} />
            </div>
          </div>
        </section>
      ) : (
        <EmptyHome />
      )}

      {rankingNovels.length > 0 && <RankingSection novels={rankingNovels} />}
      <QuickLinks />

      {continueReading.length > 0 && (
        <section className="border-b border-border py-7">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">이어보기</h2>
                <p className="mt-1 text-sm text-zinc-500">마지막으로 읽던 작품으로 바로 돌아갑니다.</p>
              </div>
              <Link href="/library" className="text-sm font-medium text-zinc-400 hover:text-accent">내 서재</Link>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {continueReading.map((item) => (
                <Link key={item.id} href={item.chapterId ? `/novels/${item.novel.id}/${item.chapterId}` : `/novels/${item.novel.id}`} className="flex items-center gap-3 rounded-md border border-border bg-background-secondary p-3 transition-colors hover:border-accent-muted hover:bg-background-tertiary">
                  <div className="flex h-12 w-12 items-center justify-center rounded border border-border text-accent">
                    <Library className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-1 font-semibold text-white">{item.novel.title}</p>
                    <p className="text-sm text-zinc-500">{item.lastChapter}화부터 이어보기</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="divide-y divide-border">
        <NovelCarousel title="오늘 업데이트" description="최근 회차와 수정이 반영된 작품" novels={updatedNovels} moreLink="/novels?sort=updated" />
        <NovelCarousel title="이번 주 신작" description="새롭게 등록된 작품을 먼저 확인하세요." novels={latestNovels} moreLink="/novels/new-releases" />
        <NovelCarousel title="완결 정주행" description="끝까지 읽을 수 있는 완결 작품" novels={completedNovels} moreLink="/novels?status=COMPLETED" />
        <NovelCarousel title="로맨스 추천" novels={romanceNovels} moreLink="/novels?genre=ROMANCE" />
        <NovelCarousel title="판타지 추천" novels={fantasyNovels} moreLink="/novels?genre=FANTASY" />
        <NovelCarousel title="작가 추천작" description="조회수와 독자 반응이 좋은 연재작" novels={authorPicks} moreLink="/novels/author-picks" />
      </div>

      {tags.length > 0 && (
        <section className="py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">키워드로 작품 찾기</h2>
                <p className="mt-1 text-sm text-zinc-500">독자가 많이 찾는 태그를 기반으로 탐색합니다.</p>
              </div>
              <Link href="/tags" className="text-sm font-medium text-zinc-400 hover:text-accent">전체 키워드</Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Link key={tag.id} href={`/novels?tag=${encodeURIComponent(tag.name)}`} className="rounded-md border border-border bg-background-secondary px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-accent-muted hover:text-white">
                  #{tag.name} <span className="text-zinc-500">{tag._count.novels}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function TopRankingPanel({ novels }: { novels: NovelListItem[] }) {
  if (novels.length === 0) {
    return (
      <aside className="rounded-md border border-white/10 bg-black/35 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur">
        <h2 className="text-lg font-bold text-white">실시간 인기</h2>
        <p className="mt-2 text-sm text-zinc-500">발행된 작품이 쌓이면 랭킹을 표시합니다.</p>
      </aside>
    );
  }

  return (
    <aside className="home-card-in overflow-hidden rounded-md border border-white/10 bg-black/35 shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">급상승 순위</p>
          <h2 className="mt-1 text-lg font-bold text-white">실시간 급상승</h2>
        </div>
        <Link href="/rankings" className="rounded-md border border-white/10 px-3 py-1.5 text-sm font-semibold text-zinc-300 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-muted hover:text-white">
          전체
        </Link>
      </div>
      <div className="divide-y divide-white/10">
        {novels.map((novel, index) => (
          <Link
            key={novel.id}
            href={`/novels/${novel.id}`}
            className="home-card-in group flex items-center gap-3 px-4 py-3 transition-all duration-300 hover:bg-white/[0.06]"
            style={{ animationDelay: `${index * 45}ms` }}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded text-sm font-bold ${index < 3 ? 'bg-accent text-zinc-950' : 'bg-white/[0.08] text-zinc-400'}`}>
              {index + 1}
            </span>
            <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded border border-white/10 bg-background-tertiary">
              {novel.coverImage ? (
                <Image src={novel.coverImage} alt={novel.title} fill sizes="40px" unoptimized={!isOptimizableImageSource(novel.coverImage)} className="object-cover transition-transform duration-500 group-hover:scale-[1.08]" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
                  <BookOpen className="h-4 w-4" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-semibold text-white group-hover:text-accent">{novel.title}</p>
              <p className="line-clamp-1 text-xs text-zinc-500">{novel.author.nickname || '익명 작가'}</p>
            </div>
            <div className="shrink-0 text-right text-[11px] text-zinc-500">
              <span className="flex items-center justify-end gap-1"><Eye className="h-3.5 w-3.5" />{novel.viewCount.toLocaleString()}</span>
              <span className="mt-1 flex items-center justify-end gap-1"><Heart className="h-3.5 w-3.5" />{novel._count.likes.toLocaleString()}</span>
            </div>
          </Link>
        ))}
      </div>
    </aside>
  );
}

function QuickLinks() {
  const links = [
    { href: '/rankings', label: '랭킹', description: '실시간 인기', icon: <Trophy className="h-5 w-5" /> },
    { href: '/novels/new-releases', label: '신작', description: '새 작품', icon: <Sparkles className="h-5 w-5" /> },
    { href: '/novels?status=COMPLETED', label: '완결', description: '정주행', icon: <BookOpen className="h-5 w-5" /> },
    { href: '/tags', label: '키워드', description: '취향 탐색', icon: <Tags className="h-5 w-5" /> },
    { href: '/novels?sort=updated', label: '업데이트', description: '오늘 연재', icon: <CalendarDays className="h-5 w-5" /> },
  ];

  return (
    <section className="border-b border-border bg-background-secondary/30">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {links.map((link, index) => (
          <Link
            key={link.href}
            href={link.href}
            className="home-card-in group flex min-h-[68px] items-center justify-between gap-2 rounded-md border border-white/10 bg-background/70 px-3 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-muted hover:bg-background-tertiary hover:text-white hover:shadow-[0_14px_32px_rgba(0,0,0,0.2)] sm:gap-3 sm:px-4"
            style={{ animationDelay: `${index * 55}ms` }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-500 transition-all duration-300 group-hover:border-accent-muted group-hover:text-accent group-hover:shadow-[0_0_22px_rgba(111,199,189,0.12)]">{link.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white sm:text-base">{link.label}</p>
                <p className="text-xs text-zinc-500">{link.description}</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-zinc-600 transition-colors group-hover:text-accent" />
          </Link>
        ))}
        </div>
      </div>
    </section>
  );
}

function EmptyHome() {
  return (
    <section className="relative isolate overflow-hidden border-b border-border">
      <Image src={HOME_HERO_IMAGE} alt="" fill priority sizes="100vw" className="home-hero-media absolute inset-0 -z-20 object-cover" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/90 to-background/55" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent to-background" />
      <div className="mx-auto flex min-h-[460px] max-w-7xl flex-col items-center justify-center px-4 text-center">
        <BookOpen className="mb-6 h-16 w-16 text-accent" />
        <h1 className="text-3xl font-bold text-white">첫 작품을 기다리고 있습니다</h1>
        <p className="mt-3 max-w-lg text-zinc-400">작가 센터에서 작품을 등록하면 추천, 랭킹, 신작 섹션에 반영됩니다.</p>
        <Link href="/novels/new" className="mt-6 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover">작품 등록하기</Link>
      </div>
    </section>
  );
}
