import { describe, expect, it } from 'vitest';
import { readFormDataBodyWithLimit } from './request-body';

function multipartBody(boundary: string, content: string) {
  return new TextEncoder().encode([
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="cover.txt"',
    'Content-Type: text/plain',
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n'));
}

function streamingRequest(body: Uint8Array, boundary: string) {
  const midpoint = Math.ceil(body.byteLength / 2);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(body.slice(0, midpoint));
      controller.enqueue(body.slice(midpoint));
      controller.close();
    },
  });

  return new Request('https://novelverse.test/api/upload/cover', {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('readFormDataBodyWithLimit', () => {
  it('제한 안의 chunked multipart 본문을 읽은 뒤 파싱한다', async () => {
    const boundary = 'novelverse-boundary';
    const body = multipartBody(boundary, 'cover');

    const formData = await readFormDataBodyWithLimit(
      streamingRequest(body, boundary),
      body.byteLength,
    );

    const file = formData.get('file');
    expect(file).toBeInstanceOf(File);
    expect(await (file as File).text()).toBe('cover');
  });

  it('Content-Length가 없어도 실제 수신 바이트가 제한을 넘으면 거부한다', async () => {
    const boundary = 'novelverse-boundary';
    const body = multipartBody(boundary, 'oversized');

    await expect(
      readFormDataBodyWithLimit(streamingRequest(body, boundary), body.byteLength - 1),
    ).rejects.toMatchObject({ status: 413 });
  });

  it('축소된 Content-Length를 신뢰하지 않고 실제 수신 바이트를 검사한다', async () => {
    const boundary = 'novelverse-boundary';
    const body = multipartBody(boundary, 'oversized');
    const request = new Request('https://novelverse.test/api/upload/cover', {
      method: 'POST',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': '1',
      },
      body,
    });

    await expect(
      readFormDataBodyWithLimit(request, body.byteLength - 1),
    ).rejects.toMatchObject({ status: 413 });
  });
});
