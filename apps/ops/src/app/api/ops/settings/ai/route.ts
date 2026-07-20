import {
  acquireAdminRoleReadLock,
  GEMINI_AI_PROVIDER,
  prisma,
} from '@novelverse/db';
import {
  handleOpsApiError,
  ok,
  OpsApiError,
  requireOpsAdmin,
} from '../../../../../lib/api';
import {
  parseAiProviderSettingInput,
  readJsonBody,
} from '../../../../../lib/admin-mutation-validation';

export async function GET() {
  try {
    await requireOpsAdmin();
    const setting = await prisma.aiProviderSetting.findUnique({
      where: { provider: GEMINI_AI_PROVIDER },
      select: { enabled: true, updatedAt: true },
    });

    return ok({
      provider: GEMINI_AI_PROVIDER,
      enabled: setting?.enabled ?? true,
      updatedAt: setting?.updatedAt.toISOString() ?? null,
    });
  } catch (error) {
    return handleOpsApiError(error, 'AI 설정을 불러오지 못했습니다.');
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireOpsAdmin();
    const body = await readJsonBody(request);
    if (!body.success) throw new OpsApiError(400, body.error);

    const input = parseAiProviderSettingInput(body.data);
    if (!input.success) throw new OpsApiError(400, input.error);

    const result = await prisma.$transaction(async (transaction) => {
      await acquireAdminRoleReadLock(transaction);
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('novelverse:ai-provider-setting:gemini')
        )::text
      `;

      const currentAdmin = await transaction.user.findFirst({
        where: { id: admin.id, role: 'ADMIN', suspendedAt: null },
        select: { id: true },
      });
      if (!currentAdmin) throw new OpsApiError(403, '관리자 권한이 필요합니다.');

      const previous = await transaction.aiProviderSetting.findUnique({
        where: { provider: GEMINI_AI_PROVIDER },
        select: { enabled: true, updatedAt: true },
      });
      const previousEnabled = previous?.enabled ?? true;

      if (previousEnabled === input.data.enabled) {
        return {
          changed: false,
          setting: {
            enabled: previousEnabled,
            updatedAt: previous?.updatedAt ?? null,
          },
        };
      }

      const setting = await transaction.aiProviderSetting.upsert({
        where: { provider: GEMINI_AI_PROVIDER },
        create: {
          provider: GEMINI_AI_PROVIDER,
          enabled: input.data.enabled,
        },
        update: { enabled: input.data.enabled },
        select: { enabled: true, updatedAt: true },
      });

      await transaction.adminAuditLog.create({
        data: {
          adminId: currentAdmin.id,
          action: input.data.enabled ? 'ai.provider.enable' : 'ai.provider.disable',
          targetType: 'aiProvider',
          targetId: GEMINI_AI_PROVIDER,
          message: `Gemini AI 서비스를 ${input.data.enabled ? '활성화' : '비활성화'}했습니다.`,
          metadata: {
            previousEnabled,
            nextEnabled: input.data.enabled,
          },
        },
      });

      return { changed: true, setting };
    });

    return ok({
      provider: GEMINI_AI_PROVIDER,
      enabled: result.setting.enabled,
      updatedAt: result.setting.updatedAt?.toISOString() ?? null,
      changed: result.changed,
    });
  } catch (error) {
    return handleOpsApiError(error, 'AI 설정을 저장하지 못했습니다.');
  }
}
