import { prisma } from '@novelverse/db';
import { fail, handleOpsApiError, message, OpsApiError, requireOpsAdmin } from '../../../../../../lib/api';
import { parseSuspensionInput, readJsonBody } from '../../../../../../lib/admin-mutation-validation';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireOpsAdmin();
    const { id } = await params;
    const json = await readJsonBody(request);
    if (!json.success) return fail(400, json.error);
    const input = parseSuspensionInput(json.data);
    if (!input.success) return fail(400, input.error);
    if (id === admin.id && input.data.suspended) {
      return fail(400, '본인 계정은 정지할 수 없습니다.');
    }

    const changed = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('novelverse:admin-role-change'))::text`;
      const currentAdmin = await transaction.user.findFirst({
        where: { id: admin.id, role: 'ADMIN', suspendedAt: null },
        select: { id: true },
      });
      if (!currentAdmin) throw new OpsApiError(403, '관리자 권한이 필요합니다.');

      const user = await transaction.user.findUnique({
        where: { id },
        select: {
          email: true,
          nickname: true,
          role: true,
          suspendedAt: true,
          suspensionReason: true,
        },
      });
      if (!user) throw new OpsApiError(404, '계정을 찾을 수 없습니다.');
      if (id === admin.id && input.data.suspended) {
        throw new OpsApiError(400, '본인 계정은 정지할 수 없습니다.');
      }

      const currentlySuspended = Boolean(user.suspendedAt);
      if (
        currentlySuspended === input.data.suspended
        && (!input.data.suspended || user.suspensionReason === input.data.reason)
      ) return false;

      if (input.data.suspended && user.role === 'ADMIN') {
        const activeAdminCount = await transaction.user.count({
          where: { role: 'ADMIN', suspendedAt: null },
        });
        if (activeAdminCount <= 1) {
          throw new OpsApiError(409, '마지막 활성 관리자 계정은 정지할 수 없습니다.');
        }
      }

      const suspendedAt = input.data.suspended ? new Date() : null;
      const updated = await transaction.user.updateMany({
        where: { id, suspendedAt: user.suspendedAt },
        data: {
          suspendedAt,
          suspensionReason: input.data.reason,
        },
      });
      if (updated.count !== 1) {
        throw new OpsApiError(409, '계정 상태가 다른 요청에 의해 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
      }

      await transaction.session.deleteMany({ where: { userId: id } });
      await transaction.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: input.data.suspended ? 'user.suspend' : 'user.unsuspend',
          targetType: 'user',
          targetId: id,
          message: `${user.nickname || user.email} 계정을 ${input.data.suspended ? '정지' : '정지 해제'}했습니다.`,
          metadata: {
            previousSuspendedAt: user.suspendedAt?.toISOString() || null,
            nextSuspendedAt: suspendedAt?.toISOString() || null,
            previousReason: user.suspensionReason,
            nextReason: input.data.reason,
          },
        },
      });
      return true;
    });

    if (!changed) return message('이미 같은 계정 상태입니다.');
    return message(input.data.suspended ? '계정을 정지했습니다.' : '계정 정지를 해제했습니다.');
  } catch (error) {
    return handleOpsApiError(error, '계정 정지 상태를 변경하지 못했습니다.');
  }
}
