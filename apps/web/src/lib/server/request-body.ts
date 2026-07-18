import { ApiError } from './api';

const JSON_CONTENT_TYPES = new Set(['application/json', 'application/ld+json']);
const MULTIPART_FORM_DATA = 'multipart/form-data';

function assertJsonContentType(request: Request) {
  const contentType = request.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();

  if (
    contentType &&
    !JSON_CONTENT_TYPES.has(contentType) &&
    !contentType.endsWith('+json')
  ) {
    throw new ApiError(415, 'JSON 형식의 요청만 처리할 수 있습니다.');
  }
}

async function readBodyBytesWithLimit(request: Request, maxBytes: number) {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      throw new ApiError(413, '요청 본문이 너무 큽니다.');
    }
  }

  if (!request.body) {
    throw new ApiError(400, '요청 본문이 필요합니다.');
  }

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
        throw new ApiError(413, '요청 본문이 너무 큽니다.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    throw new ApiError(400, '요청 본문이 필요합니다.');
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return combined;
}

export async function readJsonBodyWithLimit<T>(request: Request, maxBytes: number): Promise<T> {
  assertJsonContentType(request);
  const combined = await readBodyBytesWithLimit(request, maxBytes);

  try {
    const json = new TextDecoder('utf-8', { fatal: true }).decode(combined);
    return JSON.parse(json) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, '올바른 JSON 요청을 입력해 주세요.');
  }
}

export async function readFormDataBodyWithLimit(request: Request, maxBytes: number) {
  const contentType = request.headers.get('content-type');
  const mediaType = contentType?.split(';', 1)[0]?.trim().toLowerCase();

  if (!contentType || mediaType !== MULTIPART_FORM_DATA) {
    throw new ApiError(415, 'multipart/form-data 형식의 요청만 처리할 수 있습니다.');
  }

  const bytes = await readBodyBytesWithLimit(request, maxBytes);

  try {
    return await new Response(bytes, {
      headers: { 'content-type': contentType },
    }).formData();
  } catch {
    throw new ApiError(400, '올바른 multipart/form-data 요청을 입력해 주세요.');
  }
}
