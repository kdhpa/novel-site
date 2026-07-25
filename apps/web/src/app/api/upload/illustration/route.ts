import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { uploadFile } from '@/lib/supabase';
import { handleApiError } from '@/lib/server/api';
import { requireNovelOwnerOrAdmin } from '@/lib/server/authz';
import { assertRateLimit, getClientIp } from '@/lib/server/rate-limit';
import { normalizeUploadedImage, RemoteImageError } from '@/lib/server/remote-image';
import { readFormDataBodyWithLimit } from '@/lib/server/request-body';
import {
  ILLUSTRATION_FILE_SIZE_LABEL,
  MAX_ILLUSTRATION_FILE_BYTES,
  MAX_ILLUSTRATION_REQUEST_BYTES,
} from '@/lib/illustration-upload-limits';
import type { ApiResponse } from '@/types';
import { logServerError } from '@novelverse/shared';

export const runtime = 'nodejs';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    await assertRateLimit({
      key: `upload:illustration:${session?.user?.id || getClientIp(request)}`,
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });

    if (!session?.user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const formData = await readFormDataBodyWithLimit(
      request,
      MAX_ILLUSTRATION_REQUEST_BYTES
    );
    const file = formData.get('file');
    const novelId = formData.get('novelId');

    if (!(file instanceof File)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '이미지 파일이 필요합니다.' },
        { status: 400 }
      );
    }
    if (typeof novelId !== 'string' || !novelId.trim() || novelId.length > 100) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '작품 정보가 필요합니다.' },
        { status: 400 }
      );
    }

    await requireNovelOwnerOrAdmin(novelId, session.user);

    if (!allowedTypes.has(file.type)) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: '지원하지 않는 파일 형식입니다. JPEG, PNG, GIF, WEBP만 가능합니다.',
        },
        { status: 400 }
      );
    }
    if (file.size > MAX_ILLUSTRATION_FILE_BYTES) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: `파일 크기는 ${ILLUSTRATION_FILE_SIZE_LABEL} 이하여야 합니다.`,
        },
        { status: 400 }
      );
    }

    const normalizedImage = await normalizeUploadedImage(
      Buffer.from(await file.arrayBuffer()),
      file.type,
      MAX_ILLUSTRATION_FILE_BYTES
    );
    const fileName = `${novelId}/${Date.now()}-${crypto.randomUUID()}.webp`;
    const result = await uploadFile(
      'ILLUSTRATIONS',
      fileName,
      new Blob([new Uint8Array(normalizedImage.bytes)], {
        type: normalizedImage.contentType,
      }),
      normalizedImage.contentType
    );

    if (result.error || !result.url) {
      logServerError(
        'illustration-upload.storage',
        result.error || new Error('Storage returned no URL'),
        { userId: session.user.id, novelId }
      );
      return NextResponse.json<ApiResponse>(
        { success: false, error: '삽화 업로드에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<{ url: string }>>({
      success: true,
      data: { url: result.url },
    });
  } catch (error) {
    if (error instanceof RemoteImageError) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    return handleApiError(error, '삽화 업로드에 실패했습니다.');
  }
}
