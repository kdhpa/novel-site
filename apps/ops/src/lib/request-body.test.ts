import { describe, expect, it } from 'vitest';
import { readFormDataBodyWithLimit } from './request-body';

function multipartBody(boundary: string, content: string) {
  return new TextEncoder().encode([
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="banner.txt"',
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

  return new Request('https://ops.novelverse.test/api/ops/seasons/banner', {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('ops readFormDataBodyWithLimit', () => {
  it('제한 안의 chunked multipart 본문을 파싱한다', async () => {
    const boundary = 'novelverse-banner-boundary';
    const body = multipartBody(boundary, 'banner');
    const formData = await readFormDataBodyWithLimit(
      streamingRequest(body, boundary),
      body.byteLength,
    );

    const file = formData.get('file');
    expect(file).toBeInstanceOf(File);
    expect(await (file as File).text()).toBe('banner');
  });

  it('Content-Length가 없어도 실제 바이트가 제한을 넘으면 거부한다', async () => {
    const boundary = 'novelverse-banner-boundary';
    const body = multipartBody(boundary, 'oversized');

    await expect(
      readFormDataBodyWithLimit(streamingRequest(body, boundary), body.byteLength - 1),
    ).rejects.toMatchObject({ status: 413 });
  });

  it('multipart/form-data가 아닌 요청을 거부한다', async () => {
    const request = new Request('https://ops.novelverse.test/api/ops/seasons/banner', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    await expect(readFormDataBodyWithLimit(request, 1024))
      .rejects.toMatchObject({ status: 415 });
  });
});
