import { handleOpsApiError, ok, OpsApiError, requireOpsAdmin } from '@/lib/api';
import {
  assertContestBannerAiStatusLimits,
  getContestBannerAiJob,
} from '@/lib/contest-banner-ai-jobs';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireOpsAdmin();
    const { id } = await params;
    if (!id || id.length > 256) {
      throw new OpsApiError(400, '올바른 배너 AI 작업 ID가 필요합니다.');
    }
    const token = request.headers.get('x-banner-ai-job-token')?.trim() || '';
    if (!token || token.length > 2_048) {
      throw new OpsApiError(401, '배너 AI 작업 토큰이 필요합니다.');
    }
    await assertContestBannerAiStatusLimits(admin.id, id);
    return ok(await getContestBannerAiJob(id, admin.id, token));
  } catch (error) {
    return handleOpsApiError(error, 'AI 배너 생성 작업을 확인하지 못했습니다.');
  }
}
