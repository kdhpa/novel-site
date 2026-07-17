import { acquireAdminRoleReadLock, acquireUserPrivacyLocks, prisma } from '@novelverse/db';
import { fail, handleOpsApiError, message, OpsApiError, requireOpsAdmin } from '@/lib/api';
import { readJsonBody } from '@/lib/admin-mutation-validation';

function parseInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !['action', 'resolution'].includes(key))) return null;
  if (record.action !== 'hide' && record.action !== 'dismiss') return null;
  if (typeof record.resolution !== 'string') return null;
  const resolution = record.resolution.trim();
  if (resolution.length < 3 || resolution.length > 1000) return null;
  return { action: record.action, resolution } as const;
}

function snapshotAuthorId(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const authorId = (value as Record<string, unknown>).authorId;
  return typeof authorId === 'string' ? authorId : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireOpsAdmin();
    const { id } = await params;
    const body = await readJsonBody(request);
    if (!body.success) return fail(400, body.error);
    const input = parseInput(body.data);
    if (!input) return fail(400, '처리 방식과 3~1,000자의 사유를 입력해 주세요.');

    await prisma.$transaction(async (transaction) => {
      await acquireAdminRoleReadLock(transaction);
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`novelverse:content-report:${id}`}, 0))::text
      `;
      const [currentAdmin, initialReport] = await Promise.all([
        transaction.user.findFirst({ where: { id: admin.id, role: 'ADMIN' }, select: { id: true } }),
        transaction.contentReport.findUnique({ where: { id } }),
      ]);
      if (!currentAdmin) throw new OpsApiError(403, '관리자 권한이 필요합니다.');
      if (!initialReport) throw new OpsApiError(404, '신고를 찾을 수 없습니다.');
      if (initialReport.status !== 'open') throw new OpsApiError(409, '이미 처리된 신고입니다.');

      const initialTarget = initialReport.targetType === 'comment'
        ? await transaction.comment.findUnique({
            where: { id: initialReport.targetId },
            select: { userId: true },
          })
        : initialReport.targetType === 'review'
          ? await transaction.review.findUnique({
              where: { id: initialReport.targetId },
              select: { userId: true },
            })
          : null;
      await acquireUserPrivacyLocks(transaction, [
        initialReport.reporterId,
        initialTarget?.userId,
        snapshotAuthorId(initialReport.targetSnapshot),
      ]);

      const report = await transaction.contentReport.findUnique({ where: { id } });
      if (!report) throw new OpsApiError(404, '신고를 찾을 수 없습니다.');
      if (report.status !== 'open') throw new OpsApiError(409, '이미 처리된 신고입니다.');

      let targetAuthorId: string | null = snapshotAuthorId(report.targetSnapshot);
      let targetSnapshot: Record<string, string | number | boolean | null> | null = null;
      if (input.action === 'hide') {
        if (report.targetType === 'comment') {
          const target = await transaction.comment.findUnique({
            where: { id: report.targetId },
            select: {
              userId: true,
              novelId: true,
              parentId: true,
              content: true,
              createdAt: true,
            },
          });
          if (!target) throw new OpsApiError(404, '신고 대상 댓글이 이미 삭제되었습니다.');
          targetAuthorId = target.userId;
          targetSnapshot = {
            novelId: target.novelId,
            parentId: target.parentId,
            content: target.content,
            createdAt: target.createdAt.toISOString(),
          };
          await transaction.comment.update({
            where: { id: report.targetId },
            data: {
              isHidden: true,
              moderationReason: input.resolution,
              moderatedAt: new Date(),
              moderatedById: currentAdmin.id,
            },
          });
        } else if (report.targetType === 'review') {
          const target = await transaction.review.findUnique({
            where: { id: report.targetId },
            select: {
              userId: true,
              novelId: true,
              rating: true,
              hasSpoiler: true,
              content: true,
              createdAt: true,
            },
          });
          if (!target) throw new OpsApiError(404, '신고 대상 리뷰가 이미 삭제되었습니다.');
          targetAuthorId = target.userId;
          targetSnapshot = {
            novelId: target.novelId,
            rating: target.rating,
            hasSpoiler: target.hasSpoiler,
            content: target.content,
            createdAt: target.createdAt.toISOString(),
          };
          await transaction.review.update({
            where: { id: report.targetId },
            data: {
              isHidden: true,
              moderationReason: input.resolution,
              moderatedAt: new Date(),
              moderatedById: currentAdmin.id,
            },
          });
        } else {
          throw new OpsApiError(400, '지원하지 않는 신고 대상입니다.');
        }
      }

      const claimed = await transaction.contentReport.updateMany({
        where: { id, status: 'open' },
        data: {
          status: input.action === 'hide' ? 'resolved' : 'dismissed',
          resolution: input.resolution,
          resolvedById: currentAdmin.id,
          resolvedAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw new OpsApiError(409, '다른 관리자가 먼저 처리했습니다.');

      await transaction.adminAuditLog.create({
        data: {
          adminId: currentAdmin.id,
          action: input.action === 'hide' ? 'moderation.hide' : 'moderation.dismiss',
          targetType: report.targetType,
          targetId: report.targetId,
          message: input.action === 'hide'
            ? `${report.targetType} 콘텐츠를 신고 사유로 숨겼습니다.`
            : '콘텐츠 신고를 기각했습니다.',
          metadata: {
            reportId: report.id,
            reportReason: report.reason,
            reporterId: report.reporterId,
            targetAuthorId,
            reportedTargetSnapshot: report.targetSnapshot,
            targetSnapshot,
            resolution: input.resolution,
          },
        },
      });
    });

    return message(input.action === 'hide' ? '콘텐츠를 숨기고 신고를 처리했습니다.' : '신고를 기각했습니다.');
  } catch (error) {
    return handleOpsApiError(error, '신고 처리에 실패했습니다.');
  }
}
