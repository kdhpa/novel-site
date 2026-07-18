import Image from 'next/image';
import Link from 'next/link';
import { prisma } from '@novelverse/db';
import { ApprovalStatusLabels, isAllowedStoredImageSource } from '@novelverse/shared';
import Pagination from '../Pagination';
import { parsePage } from '@/lib/pagination';

export const metadata = {
  title: '작품 심사',
};

const PAGE_SIZE = 20;

export default async function OpsReviewsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const where = { approvalStatus: 'PENDING_REVIEW' as const };
  const [novels, total] = await Promise.all([
    prisma.novel.findMany({
      where,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        description: true,
        coverImage: true,
        genres: true,
        submittedAt: true,
        _count: { select: { chapters: true } },
        author: { select: { email: true, nickname: true } },
      },
    }),
    prisma.novel.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">작품 심사</h1>
          <p className="mt-1 text-sm text-muted">제출된 작품을 승인하면 공개 사이트에 바로 노출됩니다.</p>
        </div>
        <div className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-muted">대기 {total.toLocaleString()}건</div>
      </div>

      <div className="space-y-4">
        {novels.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-5 py-12 text-center text-muted">심사 대기 중인 작품이 없습니다.</div>
        ) : (
          novels.map((novel) => (
            <article key={novel.id} className="rounded-lg border border-border bg-surface p-5">
              <div className="grid gap-5 md:grid-cols-[112px_1fr]">
                <div className="relative h-40 w-28 overflow-hidden rounded-md bg-surface-muted">
                  {isAllowedStoredImageSource(novel.coverImage) && <Image src={novel.coverImage!} alt={novel.title} fill sizes="112px" className="object-cover" />}
                </div>
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-foreground">{novel.title}</h2>
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">{ApprovalStatusLabels.PENDING_REVIEW}</span>
                    {novel.genres.map((genre) => (
                      <span key={genre} className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-200">{genre}</span>
                    ))}
                  </div>
                  <p className="line-clamp-3 text-sm leading-6 text-muted">{novel.description || '작품 소개가 없습니다.'}</p>
                  <div className="mt-4 grid gap-3 rounded-md border border-border bg-background p-3 text-sm text-muted sm:grid-cols-2">
                    <div>
                      <p className="font-medium text-foreground">{novel.author.nickname || '익명 작가'}</p>
                      <p>{novel.author.email}</p>
                    </div>
                    <div className="sm:text-right">
                      <p>{novel._count.chapters}개 회차</p>
                      <p>제출 {novel.submittedAt ? new Date(novel.submittedAt).toLocaleString('ko-KR') : '-'}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Link
                      href={`/reviews/${novel.id}`}
                      className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
                    >
                      본문 검토 후 심사
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
      <Pagination page={page} totalPages={totalPages} pathname="/reviews" />
    </div>
  );
}
