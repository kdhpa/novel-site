import { prisma } from '@novelverse/db';
import { Activity, BookOpenCheck, ClipboardList, EyeOff, UsersRound } from 'lucide-react';

export default async function OpsDashboardPage() {
  const [pendingReviews, publishedNovels, hiddenApprovedNovels, users, authors, recentLogs] = await Promise.all([
    prisma.novel.count({ where: { approvalStatus: 'PENDING_REVIEW' } }),
    prisma.novel.count({ where: { approvalStatus: 'APPROVED', isPublished: true } }),
    prisma.novel.count({ where: { approvalStatus: 'APPROVED', isPublished: false } }),
    prisma.user.count(),
    prisma.user.count({ where: { OR: [{ role: 'AUTHOR' }, { isVerifiedAuthor: true }] } }),
    prisma.adminAuditLog.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        message: true,
        createdAt: true,
        admin: { select: { email: true, nickname: true } },
      },
    }),
  ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">운영 대시보드</h1>
        <p className="mt-1 text-sm text-muted">심사, 공개 상태, 계정 현황을 한눈에 확인합니다.</p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="심사 대기" value={pendingReviews} icon={<ClipboardList className="h-5 w-5" />} />
        <StatCard label="공개 작품" value={publishedNovels} icon={<BookOpenCheck className="h-5 w-5" />} />
        <StatCard label="내린 작품" value={hiddenApprovedNovels} icon={<EyeOff className="h-5 w-5" />} />
        <StatCard label="전체 계정" value={users} icon={<UsersRound className="h-5 w-5" />} />
        <StatCard label="작가 계정" value={authors} icon={<Activity className="h-5 w-5" />} />
      </div>

      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold text-foreground">최근 운영 로그</h2>
        </div>
        <div className="divide-y divide-border">
          {recentLogs.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted">기록된 운영 로그가 없습니다.</p>
          ) : (
            recentLogs.map((log) => (
              <div key={log.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-foreground">{log.message}</p>
                  <time className="text-xs text-muted">{new Date(log.createdAt).toLocaleString('ko-KR')}</time>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {log.action} · {log.targetType}:{log.targetId} · {log.admin?.nickname || log.admin?.email || '알 수 없음'}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-blue-300">{icon}</div>
      <p className="text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}
