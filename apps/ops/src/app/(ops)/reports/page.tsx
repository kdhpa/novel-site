import { prisma } from '@novelverse/db';
import Pagination from '../Pagination';
import { parsePage } from '@/lib/pagination';
import ReportActions from './ReportActions';

const PAGE_SIZE = 25;
const reasonLabels: Record<string, string> = {
  spam: '스팸·도배',
  harassment: '괴롭힘·혐오',
  copyright: '저작권 침해',
  privacy: '개인정보 노출',
  other: '기타',
};

function snapshotContent(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const content = (value as Record<string, unknown>).content;
  return typeof content === 'string' ? content : null;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = parsePage((await searchParams).page);
  const where = { status: 'open' };
  const [reports, total] = await Promise.all([
    prisma.contentReport.findMany({
      where,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { reporter: { select: { email: true, nickname: true } } },
    }),
    prisma.contentReport.count({ where }),
  ]);
  const commentIds = reports.filter((report) => report.targetType === 'comment').map((report) => report.targetId);
  const reviewIds = reports.filter((report) => report.targetType === 'review').map((report) => report.targetId);
  const [comments, reviews] = await Promise.all([
    prisma.comment.findMany({
      where: { id: { in: commentIds } },
      select: { id: true, content: true, isHidden: true, user: { select: { email: true, nickname: true } } },
    }),
    prisma.review.findMany({
      where: { id: { in: reviewIds } },
      select: { id: true, content: true, isHidden: true, user: { select: { email: true, nickname: true } } },
    }),
  ]);
  const targets = new Map([...comments, ...reviews].map((target) => [target.id, target]));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">콘텐츠 신고</h1>
      <p className="mt-1 text-sm text-muted">미처리 신고 {total.toLocaleString()}건</p>
      <div className="mt-6 space-y-4">
        {reports.map((report) => {
          const target = targets.get(report.targetId);
          const preservedContent = snapshotContent(report.targetSnapshot);
          return (
            <article key={report.id} className="rounded-lg border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-foreground">{reasonLabels[report.reason] || report.reason}</p>
                  <p className="mt-1 text-xs text-muted">{report.targetType} · {new Date(report.createdAt).toLocaleString('ko-KR')}</p>
                </div>
                <ReportActions reportId={report.id} />
              </div>
              <p className="mt-4 whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-sm text-foreground">
                {target?.content || preservedContent || '대상 콘텐츠가 이미 삭제되었습니다.'}
              </p>
              {report.details && <p className="mt-3 text-sm text-muted">신고 설명: {report.details}</p>}
              <p className="mt-3 text-xs text-muted">
                신고자 {report.reporter?.nickname || report.reporter?.email || '탈퇴한 사용자'} · 작성자 {target?.user.nickname || target?.user.email || (preservedContent ? '탈퇴한 사용자' : '-')}
              </p>
            </article>
          );
        })}
        {reports.length === 0 && <div className="rounded-lg border border-border bg-surface p-10 text-center text-muted">미처리 신고가 없습니다.</div>}
      </div>
      <Pagination page={page} totalPages={totalPages} pathname="/reports" />
    </div>
  );
}
