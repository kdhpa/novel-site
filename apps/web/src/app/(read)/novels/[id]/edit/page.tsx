import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { BookOpenText, ClipboardCheck } from 'lucide-react';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOpenSeasonOptions } from '@/lib/server/seasons';
import NovelForm from '@/components/editor/NovelForm';
import SubmitReviewButton from '@/components/novel/SubmitReviewButton';
import { ApprovalStatusBadge } from '@/components/ui/Badge';
import type { ApprovalStatus } from '@/types';
import type { SeasonOption } from '@/types';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: '작품 수정',
  description: '작품 정보를 수정하세요.',
};

async function getNovel(id: string, userId: string) {
  return prisma.novel.findFirst({
    where: { id, authorId: userId },
    select: {
      id: true,
      title: true,
      description: true,
      genres: true,
      status: true,
      coverImage: true,
      seasonId: true,
      season: {
        select: {
          id: true,
          slug: true,
          title: true,
          startsAt: true,
          endsAt: true,
          isActive: true,
        },
      },
      approvalStatus: true,
      approvalNote: true,
      author: { select: { canSkipReview: true } },
      tags: { select: { tag: { select: { name: true } } } },
      _count: { select: { chapters: true } },
    },
  });
}

function getReviewDescription(
  status: ApprovalStatus,
  chapterCount: number,
  canSkipReview: boolean,
) {
  if (status === 'PENDING_REVIEW') {
    return '운영팀이 작품을 검토하고 있습니다. 작품 정보나 회차를 변경하면 심사 요청이 취소됩니다.';
  }

  if (status === 'REJECTED') {
    return '반려 사유를 확인하고 작품을 수정한 뒤 다시 심사를 요청해 주세요.';
  }

  if (status === 'APPROVED') {
    return canSkipReview
      ? '수정 재심사 면제 작가입니다. 작품을 수정해도 승인 및 공개 상태가 유지됩니다.'
      : '심사가 승인되어 독자에게 공개 중인 작품입니다.';
  }

  return chapterCount > 0
    ? '작품 준비가 끝났다면 심사를 요청하세요. 승인 전에는 독자에게 공개되지 않습니다.'
    : '첫 회차를 작성하면 작품 심사를 요청할 수 있습니다.';
}

export default async function EditNovelPage({ params }: PageProps) {
  const [{ id }, session] = await Promise.all([params, auth()]);
  if (!session?.user) redirect('/login');

  const [novel, openSeasons] = await Promise.all([
    getNovel(id, session.user.id),
    getOpenSeasonOptions(),
  ]);
  if (!novel) notFound();
  const seasons = mergeCurrentSeason(openSeasons, novel.season);
  const canRequestReview = novel.approvalStatus === 'DRAFT' || novel.approvalStatus === 'REJECTED';
  const hasChapter = novel._count.chapters > 0;

  return (
    <div className="mx-auto max-w-3xl px-3 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">작품 수정</h1>
        <p className="mt-2 text-sm text-zinc-500">작품 정보, 키워드, 표지를 관리합니다.</p>
      </div>

      <section className="mb-6 border-y border-border py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-accent">
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-white">공개 심사</h2>
                <ApprovalStatusBadge status={novel.approvalStatus} />
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                {getReviewDescription(
                  novel.approvalStatus,
                  novel._count.chapters,
                  novel.author.canSkipReview,
                )}
              </p>
              {novel.approvalStatus === 'REJECTED' && novel.approvalNote && (
                <p className="mt-2 rounded-md border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  반려 사유: {novel.approvalNote}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            {canRequestReview && (
              <SubmitReviewButton
                novelId={novel.id}
                disabled={!hasChapter}
                disabledReason="회차를 1개 이상 작성해야 심사를 요청할 수 있습니다."
                className="w-full sm:w-auto"
              />
            )}
            <Link
              href={`/novels/${novel.id}/chapters/new`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-zinc-300 transition-colors hover:border-accent-muted hover:bg-background-tertiary"
            >
              <BookOpenText className="h-4 w-4" />
              {hasChapter ? '새 회차 쓰기' : '첫 회차 쓰기'}
            </Link>
          </div>
        </div>
      </section>

      <div className="rounded-lg border border-border bg-background-secondary p-4 sm:p-6">
        <NovelForm
          mode="edit"
          initialData={{
            id: novel.id,
            title: novel.title,
            description: novel.description || '',
            genres: novel.genres || [],
            status: novel.status,
            coverImage: novel.coverImage || '',
            tags: novel.tags.map((item) => item.tag.name),
            seasonId: novel.seasonId,
          }}
          seasons={seasons}
        />
      </div>
    </div>
  );
}

function mergeCurrentSeason(
  openSeasons: SeasonOption[],
  currentSeason: {
    id: string;
    slug: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    isActive: boolean;
  } | null
) {
  if (!currentSeason || openSeasons.some((season) => season.id === currentSeason.id)) {
    return openSeasons;
  }

  return [
    ...openSeasons,
    {
      id: currentSeason.id,
      slug: currentSeason.slug,
      title: currentSeason.title,
      startsAt: currentSeason.startsAt.toISOString(),
      endsAt: currentSeason.endsAt.toISOString(),
      isActive: currentSeason.isActive,
    },
  ].sort((left, right) => {
    const endDifference = Date.parse(left.endsAt) - Date.parse(right.endsAt);
    return endDifference || Date.parse(left.startsAt) - Date.parse(right.startsAt);
  });
}
