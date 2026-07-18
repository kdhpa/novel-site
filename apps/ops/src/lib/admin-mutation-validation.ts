import type { Role } from '@novelverse/db/browser';

const ROLES = ['USER', 'AUTHOR', 'ADMIN'] as const satisfies readonly Role[];

type ValidationSuccess<T> = {
  success: true;
  data: T;
};

type ValidationFailure = {
  success: false;
  error: string;
};

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function success<T>(data: T): ValidationSuccess<T> {
  return { success: true, data };
}

function failure(error: string): ValidationFailure {
  return { success: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

async function readBoundedText(
  request: Request,
  maxBytes: number
): Promise<ValidationResult<string>> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      return failure('요청 본문이 너무 큽니다.');
    }
  }

  if (!request.body) return success('');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return failure('요청 본문이 너무 큽니다.');
      }
      chunks.push(value);
    }
  } catch {
    return failure('요청 본문을 읽을 수 없습니다.');
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return success(new TextDecoder('utf-8', { fatal: true }).decode(combined));
  } catch {
    return failure('요청 본문은 UTF-8 형식이어야 합니다.');
  }
}

export async function readJsonBody(request: Request): Promise<ValidationResult<unknown>> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType && contentType !== 'application/json' && !contentType.endsWith('+json')) {
    return failure('JSON 형식의 요청만 처리할 수 있습니다.');
  }

  const rawBody = await readBoundedText(request, 16 * 1024);
  if (!rawBody.success) return rawBody;
  if (!rawBody.data.trim()) return failure('요청 본문이 필요합니다.');

  try {
    return success(JSON.parse(rawBody.data));
  } catch {
    return failure('올바른 JSON 요청 본문을 보내 주세요.');
  }
}

export async function readEmptyJsonBody(request: Request): Promise<ValidationResult<undefined>> {
  const bodyResult = await readBoundedText(request, 1024);
  if (!bodyResult.success) return bodyResult;
  const rawBody = bodyResult.data;

  if (!rawBody.trim()) return success(undefined);

  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return failure('올바른 JSON 요청 본문을 보내 주세요.');
  }

  if (!isRecord(value) || Object.keys(value).length > 0) {
    return failure('이 작업에는 입력 항목을 보낼 수 없습니다.');
  }

  return success(undefined);
}

export function parseRejectInput(value: unknown): ValidationResult<{ note: string }> {
  if (!isRecord(value) || !hasOnlyKeys(value, ['note'])) {
    return failure('허용되지 않은 입력 항목이 포함되어 있습니다.');
  }

  if (typeof value.note !== 'string') {
    return failure('반려 사유를 입력해 주세요.');
  }

  const note = value.note.trim();
  if (!note) return failure('반려 사유를 입력해 주세요.');
  if (note.length > 1000) return failure('반려 사유는 1000자 이하로 입력해 주세요.');

  return success({ note });
}

export function parseApproveInput(value: unknown): ValidationResult<{ reviewConfirmed: true }> {
  if (!isRecord(value) || !hasOnlyKeys(value, ['reviewConfirmed'])) {
    return failure('허용되지 않은 입력 항목이 포함되어 있습니다.');
  }
  if (value.reviewConfirmed !== true) {
    return failure('모든 회차의 본문을 검토했음을 확인해 주세요.');
  }
  return success({ reviewConfirmed: true });
}

export function parseVisibilityInput(value: unknown): ValidationResult<{ isPublished: boolean }> {
  if (!isRecord(value) || !hasOnlyKeys(value, ['isPublished'])) {
    return failure('허용되지 않은 입력 항목이 포함되어 있습니다.');
  }

  if (typeof value.isPublished !== 'boolean') {
    return failure('공개 여부를 true 또는 false로 지정해 주세요.');
  }

  return success({ isPublished: value.isPublished });
}

export function parseRoleInput(
  value: unknown
): ValidationResult<{ role: Role; isVerifiedAuthor?: boolean }> {
  if (!isRecord(value) || !hasOnlyKeys(value, ['role', 'isVerifiedAuthor'])) {
    return failure('허용되지 않은 입력 항목이 포함되어 있습니다.');
  }

  if (typeof value.role !== 'string' || !ROLES.some((role) => role === value.role)) {
    return failure('유효한 역할을 선택해 주세요.');
  }

  if (value.isVerifiedAuthor !== undefined && typeof value.isVerifiedAuthor !== 'boolean') {
    return failure('작가 인증 여부는 true 또는 false로 지정해 주세요.');
  }

  return success({
    role: value.role as Role,
    ...(value.isVerifiedAuthor !== undefined && { isVerifiedAuthor: value.isVerifiedAuthor }),
  });
}

export function parseSuspensionInput(
  value: unknown,
): ValidationResult<{ suspended: boolean; reason: string | null }> {
  if (!isRecord(value) || !hasOnlyKeys(value, ['suspended', 'reason'])) {
    return failure('허용되지 않은 입력 항목이 포함되어 있습니다.');
  }
  if (typeof value.suspended !== 'boolean') {
    return failure('계정 정지 여부를 true 또는 false로 지정해 주세요.');
  }

  if (!value.suspended) return success({ suspended: false, reason: null });
  if (typeof value.reason !== 'string') return failure('계정 정지 사유를 입력해 주세요.');
  const reason = value.reason.trim();
  if (!reason) return failure('계정 정지 사유를 입력해 주세요.');
  if (reason.length > 500) return failure('계정 정지 사유는 500자 이하로 입력해 주세요.');
  return success({ suspended: true, reason });
}
