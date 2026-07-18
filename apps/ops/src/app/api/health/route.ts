import { NextResponse } from 'next/server';
import { prisma } from '@novelverse/db';
import { logServerError } from '@novelverse/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const responseInit = {
  headers: {
    'Cache-Control': 'no-store, max-age=0',
  },
};

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      {
        status: 'ok',
        release: process.env.RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null,
      },
      responseInit,
    );
  } catch (error) {
    logServerError('ops-health.database', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        release: process.env.RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null,
      },
      { ...responseInit, status: 503 },
    );
  }
}
