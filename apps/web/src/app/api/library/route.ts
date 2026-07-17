import { NextRequest } from 'next/server';
import { fail, handleApiError, ok } from '@/lib/server/api';
import { requireUser } from '@/lib/server/authz';
import { getLibraryData } from './data';
import {
  isLibraryTab,
  normalizeLibraryLimit,
  normalizeLibraryPage,
  normalizeLibraryTab,
} from '@/components/library/types';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const requestedTab = searchParams.get('tab');

    if (requestedTab && !isLibraryTab(requestedTab)) {
      return fail(400, '지원하지 않는 서재 탭입니다.');
    }

    const tab = normalizeLibraryTab(requestedTab);
    const page = normalizeLibraryPage(searchParams.get('page'));
    const limit = normalizeLibraryLimit(searchParams.get('limit'));
    const data = await getLibraryData(user.id, tab, page, limit);

    return ok(data, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return handleApiError(error, '서재를 불러오는 데 실패했습니다.');
  }
}
