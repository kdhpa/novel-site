import { NextResponse } from 'next/server';
import { readLocalStoredImage } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const image = await readLocalStoredImage(path);
  if (!image) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(image.bytes), {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(image.size),
      'Content-Type': image.contentType,
      'Last-Modified': image.lastModified,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
