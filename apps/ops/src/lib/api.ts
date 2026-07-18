import { NextResponse } from 'next/server';
import { auth } from '@novelverse/auth';
import { prisma } from '@novelverse/db';
import type { Session } from 'next-auth';
import { logServerError } from '@novelverse/shared';

export class OpsApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'OpsApiError';
    this.status = status;
  }
}

export async function requireOpsAdmin(): Promise<NonNullable<Session['user']>> {
  const session = await auth();

  if (!session?.user) {
    throw new OpsApiError(401, '로그인이 필요합니다.');
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, suspendedAt: true },
  });

  if (currentUser?.role !== 'ADMIN' || currentUser.suspendedAt) {
    throw new OpsApiError(403, '관리자 권한이 필요합니다.');
  }

  return { ...session.user, role: currentUser.role };
}

function withNoStore(init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return { ...init, headers };
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, withNoStore(init));
}

export function message(message: string, init?: ResponseInit) {
  return NextResponse.json({ success: true, message }, withNoStore(init));
}

export function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, withNoStore({ status }));
}

export function handleOpsApiError(error: unknown, fallback: string) {
  if (error instanceof OpsApiError) {
    return fail(error.status, error.message);
  }

  logServerError('ops-api', error, { fallback });
  return fail(500, fallback);
}
