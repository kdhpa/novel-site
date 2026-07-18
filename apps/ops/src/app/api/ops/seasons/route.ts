import { acquireAdminRoleReadLock, prisma } from '@novelverse/db';
import { handleOpsApiError, ok, OpsApiError, requireOpsAdmin } from '@/lib/api';
import { parseSeasonPayload } from '@/lib/seasons';
import { readJsonBody } from '@/lib/admin-mutation-validation';

function isUniqueConflict(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

export async function POST(request: Request) {
  try {
    const admin = await requireOpsAdmin();
    const body = await readJsonBody(request);
    if (!body.success) throw new OpsApiError(400, body.error);
    const payload = parseSeasonPayload(body.data);

    const season = await prisma.$transaction(async (transaction) => {
      await acquireAdminRoleReadLock(transaction);

      const currentAdmin = await transaction.user.findFirst({
        where: { id: admin.id, role: 'ADMIN' },
        select: { id: true },
      });
      if (!currentAdmin) throw new OpsApiError(403, '관리자 권한이 필요합니다.');

      const created = await transaction.season.create({ data: payload });
      await transaction.adminAuditLog.create({
        data: {
          adminId: currentAdmin.id,
          action: 'season.create',
          targetType: 'season',
          targetId: created.id,
          message: `'${created.title}' 시즌을 만들었습니다.`,
          metadata: {
            slug: created.slug,
            startsAt: created.startsAt.toISOString(),
            endsAt: created.endsAt.toISOString(),
            isActive: created.isActive,
          },
        },
      });
      return created;
    });

    return ok(season, { status: 201 });
  } catch (error) {
    if (isUniqueConflict(error)) {
      return handleOpsApiError(new OpsApiError(409, '이미 사용 중인 슬러그입니다.'), '시즌을 저장하지 못했습니다.');
    }
    return handleOpsApiError(error, '시즌을 저장하지 못했습니다.');
  }
}
