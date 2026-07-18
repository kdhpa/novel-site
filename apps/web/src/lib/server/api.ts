import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { ApiResponse } from '@/types';
import { logServerError } from '@novelverse/shared';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiResponse<T>>({ success: true, data }, init);
}

export function message(message: string, init?: ResponseInit) {
  return NextResponse.json<ApiResponse>({ success: true, message }, init);
}

export function fail(status: number, error: string) {
  return NextResponse.json<ApiResponse>({ success: false, error }, { status });
}

export function handleApiError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return fail(error.status, error.message);
  }

  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const issueMessage = issue?.message;
    return fail(400, issueMessage && /[가-힣]/.test(issueMessage) ? issueMessage : '입력값을 확인해 주세요.');
  }

  logServerError('web-api', error, { fallback });
  return fail(500, fallback);
}
