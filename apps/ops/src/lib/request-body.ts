import { OpsApiError } from './api-error';

const MULTIPART_FORM_DATA = 'multipart/form-data';
const APPLICATION_JSON = 'application/json';

async function readBodyBytesWithLimit(request: Request, maxBytes: number) {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      throw new OpsApiError(413, '요청 본문이 너무 큽니다.');
    }
  }

  if (!request.body) throw new OpsApiError(400, '요청 본문이 필요합니다.');

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
        throw new OpsApiError(413, '요청 본문이 너무 큽니다.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) throw new OpsApiError(400, '요청 본문이 필요합니다.');

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

export async function readFormDataBodyWithLimit(request: Request, maxBytes: number) {
  const contentType = request.headers.get('content-type');
  const mediaType = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  if (!contentType || mediaType !== MULTIPART_FORM_DATA) {
    throw new OpsApiError(415, 'multipart/form-data 형식의 요청만 처리할 수 있습니다.');
  }

  const bytes = await readBodyBytesWithLimit(request, maxBytes);
  try {
    return await new Response(bytes, {
      headers: { 'content-type': contentType },
    }).formData();
  } catch {
    throw new OpsApiError(400, '올바른 multipart/form-data 요청을 입력해 주세요.');
  }
}

export async function readJsonBodyWithLimit<T>(request: Request, maxBytes: number): Promise<T> {
  const mediaType = request.headers.get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== APPLICATION_JSON) {
    throw new OpsApiError(415, 'application/json 형식의 요청만 처리할 수 있습니다.');
  }

  const bytes = await readBodyBytesWithLimit(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T;
  } catch {
    throw new OpsApiError(400, '올바른 JSON 요청을 입력해 주세요.');
  }
}
