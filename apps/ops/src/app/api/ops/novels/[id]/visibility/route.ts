import { acquireNovelMutationLock, prisma } from '@novelverse/db';
import { fail, handleOpsApiError, message, OpsApiError, requireOpsAdmin } from '@/lib/api';
import { parseVisibilityInput, readJsonBody } from '@/lib/admin-mutation-validation';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireOpsAdmin();
    const { id } = await params;
    const json = await readJsonBody(request);
    if (!json.success) return fail(400, json.error);

    const input = parseVisibilityInput(json.data);
    if (!input.success) return fail(400, input.error);

    const changed = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtext('novelverse:admin-role-change'))::text`;
      await acquireNovelMutationLock(tx, id);

      const currentAdmin = await tx.user.findFirst({
        where: { id: admin.id, role: 'ADMIN' },
        select: { id: true },
      });
      if (!currentAdmin) throw new OpsApiError(403, '관리자 권한이 필요합니다.');

      const novel = await tx.novel.findUnique({
        where: { id },
        select: { title: true, approvalStatus: true, isPublished: true },
      });
      if (!novel) throw new OpsApiError(404, '작품을 찾을 수 없습니다.');
      if (input.data.isPublished && novel.approvalStatus !== 'APPROVED') {
        throw new OpsApiError(400, '승인된 작품만 공개할 수 있습니다.');
      }
      if (input.data.isPublished === novel.isPublished) return false;

      const updated = await tx.novel.updateMany({
        where: {
          id,
          isPublished: novel.isPublished,
          ...(input.data.isPublished && { approvalStatus: 'APPROVED' }),
        },
        data: { isPublished: input.data.isPublished },
      });
      if (updated.count !== 1) {
        throw new OpsApiError(409, '작품 상태가 다른 요청에 의해 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
      }

      await tx.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: input.data.isPublished ? 'novel.publish' : 'novel.unpublish',
          targetType: 'novel',
          targetId: id,
          message: input.data.isPublished
            ? `'${novel.title}' 작품을 공개했습니다.`
            : `'${novel.title}' 작품을 비공개로 전환했습니다.`,
          metadata: {
            previousIsPublished: novel.isPublished,
            nextIsPublished: input.data.isPublished,
          },
        },
      });

      return true;
    });

    if (!changed) return message('이미 같은 공개 상태입니다.');
    return message(input.data.isPublished ? '작품을 공개했습니다.' : '작품을 비공개로 전환했습니다.');
  } catch (error) {
    return handleOpsApiError(error, '작품 공개 상태 변경에 실패했습니다.');
  }
}
