import { fail, handleOpsApiError, ok, requireOpsAdmin } from '@/lib/api';
import { consumeSecurityRateLimit } from '@novelverse/auth';
import {
  ContestBannerUploadError,
  MAX_CONTEST_BANNER_REQUEST_BYTES,
  storeContestBanner,
} from '@/lib/contest-banner-storage';
import { readFormDataBodyWithLimit } from '@/lib/request-body';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const admin = await requireOpsAdmin();
    const allowed = await consumeSecurityRateLimit(
      `ops:contest-banner:${admin.id}`,
      30,
      60 * 60_000,
    );
    if (!allowed) return fail(429, '배너 업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');

    const formData = await readFormDataBodyWithLimit(
      request,
      MAX_CONTEST_BANNER_REQUEST_BYTES,
    );
    const file = formData.get('file');
    if (!(file instanceof File)) return fail(400, '배너 이미지 파일이 필요합니다.');

    const stored = await storeContestBanner(file);
    return ok(stored, { status: 201 });
  } catch (error) {
    if (error instanceof ContestBannerUploadError) {
      return fail(error.status, error.message);
    }
    return handleOpsApiError(error, '배너 이미지를 업로드하지 못했습니다.');
  }
}
