import { prisma } from '@novelverse/db';
import Pagination from '../Pagination';
import { parsePage } from '@/lib/pagination';

export const metadata = {
  title: '운영 로그',
};

const PAGE_SIZE = 50;

export default async function OpsAuditLogsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const [logs, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
    prisma.adminAuditLog.count(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">운영 로그</h1>
        <p className="mt-1 text-sm text-muted">관리자 작업 이력을 최신순으로 확인합니다.</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-border bg-surface-muted text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">시간</th>
              <th className="px-4 py-3 font-medium">관리자</th>
              <th className="px-4 py-3 font-medium">액션</th>
              <th className="px-4 py-3 font-medium">대상</th>
              <th className="px-4 py-3 font-medium">메시지</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-3 text-muted">{new Date(log.createdAt).toLocaleString('ko-KR')}</td>
                <td className="px-4 py-3 text-muted">{log.admin?.nickname || log.admin?.email || '알 수 없음'}</td>
                <td className="px-4 py-3 text-foreground">{log.action}</td>
                <td className="px-4 py-3 text-muted">{log.targetType}:{log.targetId}</td>
                <td className="px-4 py-3 text-foreground">{log.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} pathname="/audit-logs" />
    </div>
  );
}
