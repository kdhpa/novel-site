import { prisma, Prisma } from '@novelverse/db';
import type { OpsAuditAction } from '@novelverse/shared';

export async function writeAuditLog(input: {
  adminId: string;
  action: OpsAuditAction;
  targetType: string;
  targetId: string;
  message: string;
  metadata?: unknown;
}) {
  return prisma.adminAuditLog.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      message: input.message,
      metadata: input.metadata === undefined ? undefined : (input.metadata as Prisma.InputJsonValue),
    },
  });
}
