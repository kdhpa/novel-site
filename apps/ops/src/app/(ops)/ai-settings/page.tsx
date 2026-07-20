import { GEMINI_AI_PROVIDER, prisma } from '@novelverse/db';
import { requireOpsAdmin } from '@/lib/api';
import AiSettingsForm from './AiSettingsForm';

export const metadata = {
  title: 'AI 설정',
};

export default async function OpsAiSettingsPage() {
  await requireOpsAdmin();
  const setting = await prisma.aiProviderSetting.findUnique({
    where: { provider: GEMINI_AI_PROVIDER },
    select: { enabled: true, updatedAt: true },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">AI 설정</h1>
        <p className="mt-1 text-sm text-muted">
          NovelVerse에서 사용하는 외부 AI 공급자의 실행 여부를 관리합니다.
        </p>
      </div>

      <AiSettingsForm
        initialEnabled={setting?.enabled ?? true}
        initialUpdatedAt={setting?.updatedAt.toISOString() ?? null}
      />
    </div>
  );
}
