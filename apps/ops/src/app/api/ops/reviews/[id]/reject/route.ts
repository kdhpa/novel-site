import { acquireNovelMutationLock, prisma } from '@novelverse/db';
import { fail, handleOpsApiError, message, OpsApiError, requireOpsAdmin } from '@/lib/api';
import { parseRejectInput, readJsonBody } from '@/lib/admin-mutation-validation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireOpsAdmin();
    const { id } = await params;
    const json = await readJsonBody(request);
    if (!json.success) return fail(400, json.error);

    const input = parseRejectInput(json.data);
    if (!input.success) return fail(400, input.error);

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtext('novelverse:admin-role-change'))::text`;
      await acquireNovelMutationLock(tx, id);

      const currentAdmin = await tx.user.findFirst({
        where: { id: admin.id, role: 'ADMIN' },
        select: { id: true },
      });
      if (!currentAdmin) throw new OpsApiError(403, '관리자 권한이 필요합니다.');

      const novel = await tx.novel.findUnique({
        where: { id },
        select: { title: true, approvalStatus: true },
      });
      if (!novel) throw new OpsApiError(404, '작품을 찾을 수 없습니다.');
      if (novel.approvalStatus !== 'PENDING_REVIEW') {
        throw new OpsApiError(409, '이미 다른 관리자가 처리했거나 심사 대기 상태가 아닙니다.');
      }

      const claimed = await tx.novel.updateMany({
        where: { id, approvalStatus: 'PENDING_REVIEW' },
        data: {
          approvalStatus: 'REJECTED',
          isPublished: false,
          approvalNote: input.data.note,
          reviewedAt: new Date(),
          reviewedById: admin.id,
        },
      });
      if (claimed.count !== 1) {
        throw new OpsApiError(409, '다른 관리자가 먼저 심사를 처리했습니다. 새로고침 후 확인해 주세요.');
      }

      await tx.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: 'review.reject',
          targetType: 'novel',
          targetId: id,
          message: `'${novel.title}' 작품을 반려했습니다.`,
          metadata: { note: input.data.note },
        },
      });
    });

    return message('작품을 반려했습니다.');
  } catch (error) {
    return handleOpsApiError(error, '작품 반려에 실패했습니다.');
  }
}
