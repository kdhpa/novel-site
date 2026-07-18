import { handleOpsApiError, ok, requireOpsAdmin } from '@/lib/api';
import {
  createContestBannerAiJob,
  parseContestBannerAiJobInput,
} from '@/lib/contest-banner-ai-jobs';
import { readJsonBodyWithLimit } from '@/lib/request-body';
import { getTrustedClientIp } from '@novelverse/shared/proxy';

export const runtime = 'nodejs';

const MAX_REQUEST_BYTES = 16 * 1024;

export async function POST(request: Request) {
  try {
    const admin = await requireOpsAdmin();
    const input = parseContestBannerAiJobInput(
      await readJsonBodyWithLimit<unknown>(request, MAX_REQUEST_BYTES),
    );
    const job = await createContestBannerAiJob(
      admin.id,
      input,
      getTrustedClientIp(request.headers),
    );
    return ok(job, { status: 202 });
  } catch (error) {
    return handleOpsApiError(error, 'AI 배너 생성 작업을 시작하지 못했습니다.');
  }
}
