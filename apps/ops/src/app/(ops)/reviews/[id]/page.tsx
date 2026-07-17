import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@novelverse/db';
import ReviewActionButtons from '../ReviewActionButtons';
import Pagination from '../../Pagination';
import { parsePage } from '@/lib/pagination';

const PAGE_SIZE = 20;

function toPlainText(html: string) {
  return html
    .replace(/<(?:br|\/p|\/div|\/li|\/blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default async function ReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const page = parsePage((await searchParams).page);
  const [novel, chapters, total] = await Promise.all([
    prisma.novel.findFirst({
      where: { id, approvalStatus: 'PENDING_REVIEW' },
      select: {
        id: true,
        title: true,
        description: true,
        genres: true,
        submittedAt: true,
        author: { select: { nickname: true, email: true } },
      },
    }),
    prisma.chapter.findMany({
      where: { novelId: id },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: [{ chapterNumber: 'asc' }, { id: 'asc' }],
      select: { id: true, chapterNumber: true, title: true, content: true },
    }),
    prisma.chapter.count({ where: { novelId: id } }),
  ]);
  if (!novel) notFound();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="space-y-6">
      <div>
        <Link href="/reviews" className="text-sm text-muted hover:text-foreground">← 심사 목록</Link>
        <h1 className="mt-3 text-2xl font-bold text-foreground">{novel.title}</h1>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
          {novel.description || '작품 소개가 없습니다.'}
        </p>
        <p className="mt-3 text-sm text-muted">
          {novel.author.nickname || '익명 작가'} · {novel.author.email} · 전체 {total}회
        </p>
      </div>

      <div className="space-y-3">
        {chapters.map((chapter) => {
          const preview = toPlainText(chapter.content).slice(0, 1_200);
          return (
            <article key={chapter.id} className="rounded-lg border border-border bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold text-foreground">
                  {chapter.chapterNumber}화 · {chapter.title}
                </h2>
                <Link
                  href={`/reviews/${id}/chapters/${chapter.id}`}
                  className="text-sm font-medium text-primary hover:text-primary-hover"
                >
                  전체 본문 열기
                </Link>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">
                {preview || '본문이 없습니다.'}{preview.length >= 1_200 ? '…' : ''}
              </p>
            </article>
          );
        })}
      </div>

      <Pagination page={page} totalPages={totalPages} pathname={`/reviews/${id}`} />
      <div className="rounded-lg border border-border bg-surface p-5">
        <ReviewActionButtons novelId={id} title={novel.title} />
      </div>
    </div>
  );
}
