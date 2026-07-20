import type { PrismaClient } from '@novelverse/db/runtime-client';
import { prisma } from './prisma';

export const GEMINI_AI_PROVIDER = 'gemini' as const;

type AiProviderSettingClient = Pick<PrismaClient, 'aiProviderSetting'>;

export async function isGeminiAiEnabled(
  client: AiProviderSettingClient = prisma,
) {
  const setting = await client.aiProviderSetting.findUnique({
    where: { provider: GEMINI_AI_PROVIDER },
    select: { enabled: true },
  });
  return setting?.enabled ?? true;
}
