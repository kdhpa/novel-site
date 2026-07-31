import { prisma } from '@novelverse/db';
import { fail, handleOpsApiError, message, OpsApiError, requireOpsAdmin } from '../../../../../../lib/api';
import {
  parseRoleInput,
  readJsonBody,
  resolveRoleMutationSettings,
} from '../../../../../../lib/admin-mutation-validation';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireOpsAdmin();
    const { id } = await params;
    const json = await readJsonBody(request);
    if (!json.success) return fail(400, json.error);

    const input = parseRoleInput(json.data);
    if (!input.success) return fail(400, input.error);
    if (id === admin.id && input.data.role !== 'ADMIN') {
      return fail(400, '본인의 관리자 권한은 해제할 수 없습니다.');
    }

    const changed = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('novelverse:admin-role-change'))::text`;

      const currentAdmin = await tx.user.findFirst({
        where: { id: admin.id, role: 'ADMIN', suspendedAt: null },
        select: { id: true },
      });
      if (!currentAdmin) throw new OpsApiError(403, '관리자 권한이 필요합니다.');

      const user = await tx.user.findUnique({
        where: { id },
        select: {
          email: true,
          nickname: true,
          role: true,
          isVerifiedAuthor: true,
          canSkipReview: true,
          suspendedAt: true,
        },
      });
      if (!user) throw new OpsApiError(404, '계정을 찾을 수 없습니다.');
      if (id === admin.id && input.data.role !== 'ADMIN') {
        throw new OpsApiError(400, '본인의 관리자 권한은 해제할 수 없습니다.');
      }

      const {
        isVerifiedAuthor: nextVerified,
        canSkipReview: nextCanSkipReview,
      } = resolveRoleMutationSettings(input.data, user);

      if (
        user.role === input.data.role
        && user.isVerifiedAuthor === nextVerified
        && user.canSkipReview === nextCanSkipReview
      ) return false;

      if (user.role === 'ADMIN' && input.data.role !== 'ADMIN' && !user.suspendedAt) {
        const adminCount = await tx.user.count({
          where: { role: 'ADMIN', suspendedAt: null },
        });
        if (adminCount <= 1) {
          throw new OpsApiError(409, '마지막 관리자 계정의 권한은 해제할 수 없습니다.');
        }
      }

      const verifiedAt = user.isVerifiedAuthor === nextVerified
        ? undefined
        : nextVerified
          ? new Date()
          : null;
      const updated = await tx.user.updateMany({
        where: {
          id,
          role: user.role,
          isVerifiedAuthor: user.isVerifiedAuthor,
          canSkipReview: user.canSkipReview,
        },
        data: {
          role: input.data.role,
          isVerifiedAuthor: nextVerified,
          canSkipReview: nextCanSkipReview,
          ...(verifiedAt !== undefined && { verifiedAt }),
        },
      });
      if (updated.count !== 1) {
        throw new OpsApiError(409, '계정 권한이 다른 요청에 의해 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
      }

      await tx.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: user.role !== input.data.role
            ? 'user.role.update'
            : user.isVerifiedAuthor !== nextVerified
              ? nextVerified
                ? 'user.author.verify'
                : 'user.author.unverify'
              : nextCanSkipReview
                ? 'user.review-exemption.enable'
                : 'user.review-exemption.disable',
          targetType: 'user',
          targetId: id,
          message: `${user.nickname || user.email} 계정의 역할과 작가 설정을 변경했습니다.`,
          metadata: {
            previousRole: user.role,
            nextRole: input.data.role,
            previousIsVerifiedAuthor: user.isVerifiedAuthor,
            nextIsVerifiedAuthor: nextVerified,
            previousCanSkipReview: user.canSkipReview,
            nextCanSkipReview,
          },
        },
      });

      return true;
    });

    if (!changed) return message('이미 같은 계정 권한과 작가 설정 상태입니다.');
    return message('계정 권한을 저장했습니다.');
  } catch (error) {
    return handleOpsApiError(error, '계정 권한 변경에 실패했습니다.');
  }
}
