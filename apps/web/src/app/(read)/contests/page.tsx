import Image from 'next/image';
import Link from 'next/link';
import { CalendarDays, Megaphone, Trophy } from 'lucide-react';
import prisma from '@/lib/prisma';
import type { Metadata } from 'next';
import { isOptimizableImageSource } from '@/lib/image-hosts';

export const metadata: Metadata = {
  title: '공모전',
  description: 'NovelVerse에서 진행 중인 웹소설 공모전과 응모작을 확인하세요.',
};

export const dynamic = 'force-dynamic';

function getContestStatus(contest: { startsAt: Date | string; endsAt: Date | string }) {
  const now = new Date();
  const startsAt = new Date(contest.startsAt);
  const endsAt = new Date(contest.endsAt);
  if (startsAt > now) return { label: '예정', className: 'bg-blue-500/15 text-blue-200' };
  if (endsAt < now) return { label: '종료', className: 'bg-zinc-500/15 text-zinc-300' };
  return { label: '접수중', className: 'bg-emerald-500/15 text-emerald-200' };
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

const getActiveContests = () => prisma.season.findMany({
    where: { isActive: true },
    take: 60,
    orderBy: [{ startsAt: 'desc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      coverImage: true,
      startsAt: true,
      endsAt: true,
      _count: {
        select: {
          novels: {
            where: {
              isPublished: true,
              approvalStatus: 'APPROVED',
            },
          },
        },
      },
    },
  });

export default async function ContestsPage() {
  const contests = await getActiveContests();
  const statusCounts = contests.reduce(
    (acc, contest) => {
      const status = getContestStatus(contest).label;
      if (status === '접수중') acc.open += 1;
      if (status === '예정') acc.upcoming += 1;
      if (status === '종료') acc.closed += 1;
      return acc;
    },
    { open: 0, upcoming: 0, closed: 0 }
  );
  const openContests = contests.filter((contest) => {
    const now = new Date();
    return new Date(contest.startsAt) <= now && new Date(contest.endsAt) >= now;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-5 border-b border-border pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-sm font-semibold text-accent">NovelVerse 공모전</p>
              <h1 className="text-3xl font-bold text-white">공모전</h1>
              <p className="mt-2 text-sm text-zinc-500">시즌별로 열리는 웹소설 공모전에 응모하고 참가작을 둘러보세요.</p>
            </div>
            <div className="grid grid-cols-3 overflow-hidden rounded-md border border-border bg-background-secondary text-center text-sm">
              <StatusStat label="접수중" value={statusCounts.open} />
              <StatusStat label="예정" value={statusCounts.upcoming} />
              <StatusStat label="종료" value={statusCounts.closed} />
            </div>
          </div>
        </div>

        {openContests.length > 0 && <ContestTabs contests={openContests} activeSlug={null} />}

        <div className="hidden">
          {['전체 공모전', '접수중', '예정', '종료'].map((label, index) => (
            <span
              key={label}
              className={`shrink-0 rounded-md border px-4 py-2 text-sm font-semibold ${
                index === 0
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-background-secondary text-zinc-400'
              }`}
            >
              {label}
            </span>
          ))}
        </div>

        {contests.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {contests.map((contest) => {
              const status = getContestStatus(contest);
              return (
                <Link
                  key={contest.id}
                  href={`/contests/${contest.slug}`}
                  className="group overflow-hidden rounded-md border border-border bg-background-secondary transition-colors hover:border-accent-muted"
                >
                  <div className="relative aspect-[16/7] bg-background-tertiary">
                    {contest.coverImage ? (
                      <Image src={contest.coverImage} alt={contest.title} fill sizes="(min-width: 1280px) 390px, (min-width: 768px) 50vw, 100vw" unoptimized={!isOptimizableImageSource(contest.coverImage)} className="object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-background-tertiary text-zinc-600">
                        <Megaphone className="h-12 w-12" />
                      </div>
                    )}
                    <div className="absolute left-3 top-3">
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
                    </div>
                  </div>

                  <div className="p-4">
                    <h2 className="line-clamp-1 text-lg font-bold text-white transition-colors group-hover:text-accent">{contest.title}</h2>
                    <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-500">
                      {contest.description || '공모전 소개가 아직 등록되지 않았습니다.'}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(contest.startsAt)} - {formatDate(contest.endsAt)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Trophy className="h-3.5 w-3.5" />
                        공개 응모작 {contest._count.novels.toLocaleString()}개
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-background-secondary text-center">
            <Megaphone className="mb-4 h-12 w-12 text-zinc-600" />
            <p className="text-zinc-300">진행 중인 공모전이 없습니다.</p>
            <p className="mt-1 text-sm text-zinc-500">새 공모전이 열리면 이곳에 표시됩니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20 border-r border-border px-4 py-3 last:border-r-0">
      <p className="text-lg font-bold text-white">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-zinc-500">{label}</p>
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
  activeSlug: string | null;
}) {
  return (
    <div className="mb-5 flex gap-2 overflow-x-auto hide-scrollbar">
      <Link
        href="/contests"
        className={`shrink-0 rounded-md border px-4 py-2 text-sm font-semibold ${
          activeSlug === null
            ? 'border-primary bg-primary text-white'
            : 'border-border bg-background-secondary text-zinc-400 hover:border-accent-muted hover:text-white'
        }`}
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
