import { acquireAdminRoleReadLock, prisma } from '@novelverse/db';
import { handleOpsApiError, ok, OpsApiError, requireOpsAdmin } from '@/lib/api';
import { parseSeasonPayload } from '@/lib/seasons';
import { readJsonBody } from '@/lib/admin-mutation-validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function isUniqueConflict(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const admin = await requireOpsAdmin();
    const { id } = await params;
    const body = await readJsonBody(request);
    if (!body.success) throw new OpsApiError(400, body.error);
    const payload = parseSeasonPayload(body.data);

    const updatedSeason = await prisma.$transaction(async (transaction) => {
      await acquireAdminRoleReadLock(transaction);

      const currentAdmin = await transaction.user.findFirst({
        where: { id: admin.id, role: 'ADMIN' },
        select: { id: true },
      });
      if (!currentAdmin) throw new OpsApiError(403, '관리자 권한이 필요합니다.');

      const current = await transaction.season.findUnique({ where: { id } });
      if (!current) throw new OpsApiError(404, '시즌을 찾을 수 없습니다.');

      const updated = await transaction.season.update({ where: { id }, data: payload });
      await transaction.adminAuditLog.create({
        data: {
          adminId: currentAdmin.id,
          action: 'season.update',
          targetType: 'season',
          targetId: id,
          message: `'${updated.title}' 시즌을 수정했습니다.`,
          metadata: {
            previous: {
              title: current.title,
              slug: current.slug,
              coverImage: current.coverImage,
              startsAt: current.startsAt.toISOString(),
              endsAt: current.endsAt.toISOString(),
              isActive: current.isActive,
            },
            next: {
              title: updated.title,
              slug: updated.slug,
              coverImage: updated.coverImage,
              startsAt: updated.startsAt.toISOString(),
              endsAt: updated.endsAt.toISOString(),
              isActive: updated.isActive,
            },
          },
        },
      });
      return updated;
    });

    return ok(updatedSeason);
  } catch (error) {
    if (isUniqueConflict(error)) {
      return handleOpsApiError(new OpsApiError(409, '이미 사용 중인 슬러그입니다.'), '시즌을 수정하지 못했습니다.');
    }
    return handleOpsApiError(error, '시즌을 수정하지 못했습니다.');
  }
}
