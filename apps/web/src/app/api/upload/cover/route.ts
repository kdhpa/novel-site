// Cover Image Upload API Route
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { uploadFile } from '@/lib/supabase';
import { handleApiError } from '@/lib/server/api';
import { assertRateLimit, getClientIp } from '@/lib/server/rate-limit';
import { normalizeUploadedImage, RemoteImageError } from '@/lib/server/remote-image';
import { readFormDataBodyWithLimit } from '@/lib/server/request-body';
import type { ApiResponse } from '@/types';
import { logServerError } from '@novelverse/shared';

const MAX_COVER_FILE_BYTES = 5 * 1024 * 1024;
// 파일 필드 헤더와 boundary 등 multipart 인코딩에 최대 1MiB를 별도로 허용한다.
const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const MAX_COVER_REQUEST_BYTES = MAX_COVER_FILE_BYTES + MAX_MULTIPART_OVERHEAD_BYTES;

// POST /api/upload/cover
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    await assertRateLimit({
      key: `upload:cover:${session?.user?.id || getClientIp(request)}`,
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });

    if (!session?.user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const formData = await readFormDataBodyWithLimit(request, MAX_COVER_REQUEST_BYTES);
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '파일이 필요합니다.' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
    if (!allowedTypes.has(file.type)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '지원하지 않는 파일 형식입니다. JPEG, PNG, GIF, WEBP만 가능합니다.' },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    if (file.size > MAX_COVER_FILE_BYTES) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '파일 크기는 5MB 이하여야 합니다.' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const normalizedImage = await normalizeUploadedImage(
      Buffer.from(await file.arrayBuffer()),
      file.type,
      MAX_COVER_FILE_BYTES
    );
    const timestamp = Date.now();
    const randomId = crypto.randomUUID();
    const fileName = `${session.user.id}/${timestamp}-${randomId}.webp`;

    // Upload to Supabase storage
    const result = await uploadFile(
      'COVERS',
      fileName,
      new Blob([new Uint8Array(normalizedImage.bytes)], { type: normalizedImage.contentType }),
      normalizedImage.contentType
    );

    if (result.error || !result.url) {
      logServerError('cover-upload.storage', result.error || new Error('Storage returned no URL'), {
        userId: session.user.id,
      });
      return NextResponse.json<ApiResponse>(
        { success: false, error: '업로드에 실패했습니다.' },
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
    return handleApiError(error, '파일 업로드에 실패했습니다.');
  }
}
