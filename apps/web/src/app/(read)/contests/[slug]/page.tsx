import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { CalendarDays, FileText, Megaphone, PenLine, Trophy } from 'lucide-react';
import NovelCard from '@/components/novel/NovelCard';
import prisma from '@/lib/prisma';
import type { NovelListItem } from '@/types';
import type { Metadata } from 'next';
import { isOptimizableImageSource } from '@/lib/image-hosts';
import ServerPagination from '@/components/ui/ServerPagination';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 24;

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1;
}

function getContestStatus(contest: { startsAt: Date | string; endsAt: Date | string }) {
  const now = new Date();
  const startsAt = new Date(contest.startsAt);
  const endsAt = new Date(contest.endsAt);
  if (startsAt > now) return { label: '예정', className: 'bg-blue-500/15 text-blue-200', open: false };
  if (endsAt < now) return { label: '접수 종료', className: 'bg-zinc-500/15 text-zinc-300', open: false };
  return { label: '접수중', className: 'bg-emerald-500/15 text-emerald-200', open: true };
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

const getContest = cache(
  async (slug: string) => prisma.season.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      coverImage: true,
      startsAt: true,
      endsAt: true,
    },
  }),
);

async function getContestPageData(contestId: string, page: number) {
    const now = new Date();
    return Promise.all([
      prisma.novel.findMany({
        where: {
          seasonId: contestId,
          isPublished: true,
          approvalStatus: 'APPROVED',
        },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
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
      prisma.novel.count({
        where: {
          seasonId: contestId,
          isPublished: true,
          approvalStatus: 'APPROVED',
        },
      }),
      prisma.season.findMany({
        where: {
          isActive: true,
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
        orderBy: [{ startsAt: 'desc' }],
        select: {
          id: true,
          slug: true,
          title: true,
          startsAt: true,
          endsAt: true,
        },
      }),
    ]);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const contest = await getContest(slug);
  if (!contest) return { title: '공모전을 찾을 수 없습니다' };
  return {
    title: contest.title,
    description: contest.description || `${contest.title} 응모작을 확인하세요.`,
  };
}

export default async function ContestDetailPage({ params, searchParams }: PageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const page = parsePage(query.page);
  const contest = await getContest(slug);
  if (!contest) notFound();

  const [entries, totalEntries, contestTabs] = await getContestPageData(contest.id, page);
  const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));
  const status = getContestStatus(contest);

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-background-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
                <span className="inline-flex items-center gap-1 rounded border border-border bg-background-tertiary px-2 py-1 text-xs text-zinc-400">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDate(contest.startsAt)} - {formatDate(contest.endsAt)}
                </span>
              </div>
              <p className="mb-2 text-sm font-semibold text-accent">NovelVerse 공모전</p>
              <h1 className="text-3xl font-bold leading-tight text-white md:text-4xl">{contest.title}</h1>
              <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-zinc-400">
                {contest.description || '공모전 소개가 아직 등록되지 않았습니다.'}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {status.open ? (
                  <Link href="/novels/new" className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover">
                    <PenLine className="h-4 w-4" />
                    작품 응모하기
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-md border border-border bg-background-tertiary px-5 py-3 text-sm font-semibold text-zinc-400">
                    현재 응모할 수 없습니다
                  </span>
                )}
              </div>
            </div>

            <div className="relative aspect-[16/9] overflow-hidden rounded-md border border-border bg-background-tertiary">
              {contest.coverImage ? (
                <Image src={contest.coverImage} alt={contest.title} fill priority sizes="(min-width: 1024px) 960px, 100vw" unoptimized={!isOptimizableImageSource(contest.coverImage)} className="object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
                  <Megaphone className="h-16 w-16" />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {contestTabs.length > 0 && (
        <div className="border-b border-border bg-background">
          <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
            <ContestTabs contests={contestTabs} activeSlug={contest.slug} />
          </div>
        </div>
      )}

      <div className="sticky top-[125px] z-20 border-b border-border bg-background xl:top-[69px]">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {['공모전 안내', '응모작'].map((label) => (
            <a key={label} href={`#${label}`} className="shrink-0 px-5 py-4 text-sm font-semibold text-zinc-400 transition-colors hover:text-white first:text-accent">
              {label}
            </a>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section id="공모전 안내" className="mb-8 grid scroll-mt-[190px] gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:scroll-mt-[134px]">
          <div className="rounded-md border border-border bg-background-secondary p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-accent">
              <FileText className="h-4 w-4" />
              응모 안내
            </div>
            <div className="space-y-3 text-sm leading-7 text-zinc-400">
              <p>작품 등록 또는 작품 수정 화면에서 <span className="font-semibold text-zinc-200">공모전 응모</span> 항목을 선택하면 이 공모전에 응모됩니다.</p>
              <p>응모작은 작품이 공개 상태이고 심사 승인된 경우에만 이 페이지에 노출됩니다.</p>
              <p>운영자가 등록한 별도 안내, 주제, 유의사항은 공모전 소개 영역에 함께 표시됩니다.</p>
            </div>
          </div>

          <div className="rounded-md border border-border bg-background-secondary p-5">
            <div className="mb-4 text-sm font-semibold text-white">접수 정보</div>
            <dl className="space-y-3 text-sm">
              <InfoRow label="상태" value={status.label} />
              <InfoRow label="시작" value={formatDate(contest.startsAt)} />
              <InfoRow label="마감" value={formatDate(contest.endsAt)} />
              <InfoRow label="공개 응모작" value={`${totalEntries.toLocaleString()}개`} />
            </dl>
          </div>
        </section>

        <section id="응모작" className="scroll-mt-[190px] xl:scroll-mt-[134px]">
          <div className="mb-5 flex items-end justify-between border-b border-border pb-4">
          <div>
            <p className="text-sm font-semibold text-accent">응모작</p>
            <h2 className="mt-1 text-2xl font-bold text-white">응모작</h2>
          </div>
          <span className="text-sm text-zinc-500">총 {totalEntries.toLocaleString()}개 작품</span>
          </div>

          {entries.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {(entries as NovelListItem[]).map((novel) => (
                <NovelCard key={novel.id} novel={novel} showDescription />
              ))}
            </div>
          ) : (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-background-secondary text-center">
              <Trophy className="mb-4 h-12 w-12 text-zinc-600" />
              <p className="text-zinc-300">아직 공개된 응모작이 없습니다.</p>
              <p className="mt-1 text-sm text-zinc-500">승인되고 공개된 작품만 이곳에 표시됩니다.</p>
            </div>
          )}
          <ServerPagination pathname={`/contests/${slug}`} page={page} totalPages={totalPages} />
        </section>
      </main>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-semibold text-zinc-200">{value}</dd>
    </div>
  );
}

function ContestTabs({
  contests,
  activeSlug,
}: {
  contests: Array<{
    id: string;
    slug: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
  }>;
  activeSlug: string;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-4 hide-scrollbar">
      <Link
        href="/contests"
        className="shrink-0 rounded-md border border-border bg-background-secondary px-4 py-2 text-sm font-semibold text-zinc-400 transition-colors hover:border-accent-muted hover:text-white"
      >
        전체
      </Link>
      {contests.map((contest) => {
        const status = getContestStatus(contest);
        const active = activeSlug === contest.slug;
        return (
          <Link
            key={contest.id}
            href={`/contests/${contest.slug}`}
            className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
              active
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-background-secondary text-zinc-300 hover:border-accent-muted hover:text-white'
            }`}
          >
            <span>{contest.title}</span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${active ? 'bg-white/15 text-white' : status.className}`}>
              {status.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
