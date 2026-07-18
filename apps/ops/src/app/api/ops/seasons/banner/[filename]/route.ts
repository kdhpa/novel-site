import { NextResponse } from 'next/server';
import { handleOpsApiError, requireOpsAdmin } from '@/lib/api';
import { readStoredContestBanner } from '@/lib/contest-banner-storage';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  try {
    await requireOpsAdmin();
    const { filename } = await params;
    const image = await readStoredContestBanner(filename);
    if (!image) return new NextResponse(null, { status: 404 });

    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Length': String(image.size),
        'Content-Type': 'image/webp',
        'Last-Modified': image.lastModified,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return handleOpsApiError(error, '배너 미리보기를 불러오지 못했습니다.');
  }
}
