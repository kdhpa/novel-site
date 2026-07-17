import { handleApiError, ok } from '@/lib/server/api';
import { getOpenSeasonOptions } from '@/lib/server/seasons';

export async function GET() {
  try {
    const seasons = await getOpenSeasonOptions();
    return ok(
      { items: seasons },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error, '시즌 목록을 불러오는 데 실패했습니다.');
  }
}
