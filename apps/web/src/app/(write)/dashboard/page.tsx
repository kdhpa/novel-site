import Link from 'next/link';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import SubmitReviewButton from '@/components/novel/SubmitReviewButton';
import { ApprovalStatusBadge } from '@/components/ui/Badge';
import type { Metadata } from 'next';
import { BookOpen, Plus } from 'lucide-react';
import ServerPagination from '@/components/ui/ServerPagination';

export const metadata: Metadata = {
  title: '작가센터',
  description: '작품과 회차를 관리하고 공개 심사를 요청합니다.',
};

const PAGE_SIZE = 20;

async function getUserNovels(userId: string, page: number) {
  const where = { authorId: userId };
  const [novels, total] = await Promise.all([
    prisma.novel.findMany({
      where,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        title: true,
        approvalStatus: true,
        approvalNote: true,
        _count: { select: { chapters: true } },
      },
    }),
    prisma.novel.count({ where }),
  ]);
  return { novels, total };
}

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1;
}

function canRequestReview(status: string) {
  return status === 'DRAFT' || status === 'REJECTED';
}

function getNextAction(status: string, chapterCount: number) {
  if (status === 'PENDING_REVIEW') return '운영 심사 결과 대기 중';
  if (status === 'APPROVED') return '독자에게 공개 중';
  if (chapterCount === 0) return '첫 회차 작성';
  return status === 'REJECTED' ? '수정 후 재심사 요청' : '심사 요청';
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [session, query] = await Promise.all([auth(), searchParams]);
  if (!session?.user) redirect('/login?callbackUrl=/dashboard');

  const page = parsePage(query.page);
  const { novels, total } = await getUserNovels(session.user.id, page);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/95">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <Link href="/" className="mb-3 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-accent">
              &larr; 독자 홈
            </Link>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">작가 작업실</p>
            <h1 className="mt-2 text-3xl font-bold text-white">글쓰기</h1>
            <p className="mt-2 text-sm text-zinc-500">회차를 작성하고 작품의 공개 심사 상태를 관리하세요.</p>
          </div>
          <Link
            href="/novels/new"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            새 작품 만들기
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {total === 0 ? (
          <section className="flex min-h-[420px] flex-col items-center justify-center rounded-md border border-border bg-background-secondary px-6 text-center">
            <BookOpen className="h-14 w-14 text-zinc-600" />
            <h2 className="mt-5 text-2xl font-bold text-white">아직 쓸 작품이 없습니다</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
              작품을 하나 만들면 이 화면에서 바로 회차를 이어 쓸 수 있습니다.
            </p>
            <Link
              href="/novels/new"
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" />
              첫 작품 만들기
            </Link>
          </section>
        ) : (
          <section>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-white">내 작품</h2>
              <p className="mt-1 text-sm text-zinc-500">총 {total.toLocaleString()}개 · 회차를 준비한 뒤 이곳에서 심사를 요청할 수 있습니다.</p>
            </div>

            <div className="grid gap-3">
              {novels.map((novel) => (
                <article
                  key={novel.id}
                  className="rounded-md border border-border bg-background-secondary p-4 transition-colors hover:border-accent-muted"
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="line-clamp-1 text-lg font-bold text-white">{novel.title}</h3>
                        <ApprovalStatusBadge status={novel.approvalStatus} />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
                        <span>{novel._count.chapters}화</span>
                        <span>다음 작업: {getNextAction(novel.approvalStatus, novel._count.chapters)}</span>
                      </div>
                      {novel.approvalStatus === 'REJECTED' && novel.approvalNote && (
                        <p className="mt-3 rounded-md border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                          반려 사유: {novel.approvalNote}
                        </p>
                      )}
                    </div>

                    <div className="grid gap-2 sm:flex sm:flex-wrap lg:justify-end">
                      {canRequestReview(novel.approvalStatus) && (
                        <SubmitReviewButton
                          novelId={novel.id}
                          disabled={novel._count.chapters === 0}
                          disabledReason="회차를 1개 이상 작성해야 심사를 요청할 수 있습니다."
                          variant={novel._count.chapters > 0 ? 'primary' : 'outline'}
                          className="w-full sm:w-auto"
                        />
                      )}
                      <Link
                        href={`/novels/${novel.id}/chapters/new`}
                        className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors ${
                          canRequestReview(novel.approvalStatus) && novel._count.chapters > 0
                            ? 'border border-border text-zinc-200 hover:border-accent-muted hover:bg-background-tertiary'
                            : 'bg-primary text-white hover:bg-primary-hover'
                        }`}
                      >
                        <Plus className="h-4 w-4" />
                        새 회차 쓰기
                      </Link>
                      <Link
                        href={`/novels/${novel.id}/chapters`}
                        className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold text-zinc-200 transition-colors hover:border-accent-muted hover:bg-background-tertiary"
                      >
                        회차 목록
                      </Link>
                      <Link
                        href={`/novels/${novel.id}/edit`}
                        className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold text-zinc-300 transition-colors hover:border-accent-muted hover:bg-background-tertiary"
                      >
                        작품 설정
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <ServerPagination pathname="/dashboard" page={page} totalPages={totalPages} />
          </section>
        )}
      </main>
    </div>
  );
}
