import { lookup } from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import { OpsApiError } from './api-error';

const ALLOWED_IMAGE_HOST = 'replicate.delivery';
const MAX_REDIRECTS = 3;

type SupportedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

type RemoteImageResponse = {
  bytes?: Buffer;
  contentType?: SupportedImageType;
  redirectUrl?: URL;
};

function normalizeHostname(value: string) {
  return value.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

export function isAllowedContestBannerAiImageHost(hostname: string) {
  const normalized = normalizeHostname(hostname);
  return normalized === ALLOWED_IMAGE_HOST || normalized.endsWith(`.${ALLOWED_IMAGE_HOST}`);
}

function isPublicIpv4(address: string) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b, c, d] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  if (a === 168 && b === 63 && c === 129 && d === 16) return false;
  return true;
}

function parseIpv6(address: string): number[] | null {
  const normalized = normalizeHostname(address).split('%', 1)[0];
  const halves = normalized.split('::');
  if (halves.length > 2) return null;

  const parseHalf = (half: string) => {
    if (!half) return [] as number[];
    const values: number[] = [];
    for (const piece of half.split(':')) {
      if (piece.includes('.')) {
        if (net.isIP(piece) !== 4) return null;
        const octets = piece.split('.').map(Number);
        values.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/i.test(piece)) return null;
      values.push(Number.parseInt(piece, 16));
    }
    return values;
  };

  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] || '');
  if (!left || !right) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  const zeroCount = 8 - left.length - right.length;
  if (zeroCount < 1) return null;
  return [...left, ...Array<number>(zeroCount).fill(0), ...right];
}

function isPublicIpv6(address: string) {
  const parts = parseIpv6(address);
  if (!parts || parts.length !== 8) return false;
  const first = parts[0];
  const second = parts[1];
  if ((first & 0xe000) !== 0x2000) return false;
  if (first === 0x2001 && second === 0x0000) return false;
  if (first === 0x2001 && second === 0x000d && parts[2] === 0x0b08) return false;
  if (first === 0x2001 && second === 0x0010) return false;
  if (first === 0x2001 && second === 0x0020) return false;
  if (first === 0x2001 && second === 0x0db8) return false;
  if (first === 0x2002) return false;
  return true;
}

export function isPublicContestBannerAiAddress(address: string) {
  const normalized = normalizeHostname(address);
  const family = net.isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family === 6) return isPublicIpv6(normalized);
  return false;
}

function validateRemoteUrl(url: URL) {
  if (
    url.href.length > 4_096 ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !isAllowedContestBannerAiImageHost(url.hostname)
  ) {
    throw new OpsApiError(502, 'AI 이미지 공급자가 허용되지 않은 결과 주소를 반환했습니다.');
  }
}

async function resolvePublicAddress(url: URL, deadline: number) {
  const hostname = normalizeHostname(url.hostname);
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new OpsApiError(504, 'AI 결과 이미지 요청 시간이 초과되었습니다.');

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = net.isIP(hostname)
      ? [{ address: hostname, family: net.isIP(hostname) }]
      : await Promise.race([
          lookup(hostname, { all: true, verbatim: false }),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new OpsApiError(504, 'AI 결과 이미지 요청 시간이 초과되었습니다.')),
              remainingMs,
            );
          }),
        ]);

    if (!addresses.length || addresses.some((entry) => !isPublicContestBannerAiAddress(entry.address))) {
      throw new OpsApiError(502, 'AI 결과 이미지가 공개 인터넷 주소를 사용하지 않습니다.');
    }
    return [...addresses].sort((left, right) => left.family - right.family)[0];
  } catch (error) {
    if (error instanceof OpsApiError) throw error;
    throw new OpsApiError(502, 'AI 결과 이미지 호스트를 확인하지 못했습니다.');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeContentType(value: string | string[] | undefined): SupportedImageType | null {
  const type = (Array.isArray(value) ? value[0] : value)?.split(';', 1)[0]?.trim().toLowerCase();
  return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp' ? type : null;
}

function hasMatchingSignature(bytes: Buffer, contentType: SupportedImageType) {
  if (contentType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === 'image/png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  return bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

function requestImageOnce(
  url: URL,
  address: { address: string; family: number },
  deadline: number,
  maxBytes: number,
): Promise<RemoteImageResponse> {
  return new Promise((resolve, reject) => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      reject(new OpsApiError(504, 'AI 결과 이미지 요청 시간이 초과되었습니다.'));
      return;
    }

    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      callback();
    };

    const originalHostname = normalizeHostname(url.hostname);
    const request = https.request({
      protocol: 'https:',
      hostname: address.address,
      family: address.family,
      port: 443,
      servername: originalHostname,
      method: 'GET',
      path: `${url.pathname}${url.search}`,
      headers: {
        Accept: 'image/jpeg, image/png, image/webp',
        Host: url.host,
        'User-Agent': 'NovelVerse-Ops-Banner/1.0',
      },
      rejectUnauthorized: true,
    }, (response) => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.destroy();
        if (!location) {
          settle(() => reject(new OpsApiError(502, 'AI 결과 이미지 리디렉션이 올바르지 않습니다.')));
          return;
        }
        try {
          settle(() => resolve({ redirectUrl: new URL(location, url) }));
        } catch {
          settle(() => reject(new OpsApiError(502, 'AI 결과 이미지 리디렉션이 올바르지 않습니다.')));
        }
        return;
      }
      if (status !== 200) {
        response.destroy();
        settle(() => reject(new OpsApiError(502, 'AI 결과 이미지 서버가 요청을 처리하지 못했습니다.')));
        return;
      }

      const contentLength = Number(response.headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        response.destroy();
        settle(() => reject(new OpsApiError(413, 'AI 결과 이미지 파일이 너무 큽니다.')));
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      response.on('data', (chunk: Buffer | Uint8Array) => {
        if (settled) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.byteLength;
        if (totalBytes > maxBytes) {
          response.destroy();
          settle(() => reject(new OpsApiError(413, 'AI 결과 이미지 파일이 너무 큽니다.')));
          return;
        }
        chunks.push(buffer);
      });
      response.on('end', () => {
        if (settled) return;
        const contentType = normalizeContentType(response.headers['content-type']);
        const bytes = Buffer.concat(chunks, totalBytes);
        if (!contentType || !hasMatchingSignature(bytes, contentType)) {
          settle(() => reject(new OpsApiError(415, 'AI 결과 이미지 형식과 파일 내용이 일치하지 않습니다.')));
          return;
        }
        settle(() => resolve({ bytes, contentType }));
      });
      response.on('error', () => {
        settle(() => reject(new OpsApiError(502, 'AI 결과 이미지를 읽지 못했습니다.')));
      });
      response.on('aborted', () => {
        settle(() => reject(new OpsApiError(502, 'AI 결과 이미지 전송이 중단되었습니다.')));
      });
    });

    const hardTimeout = setTimeout(() => {
      request.destroy();
      settle(() => reject(new OpsApiError(504, 'AI 결과 이미지 요청 시간이 초과되었습니다.')));
    }, remainingMs);
    request.on('error', () => {
      settle(() => reject(new OpsApiError(502, 'AI 결과 이미지 서버에 연결하지 못했습니다.')));
    });
    request.end();
  });
}

export async function fetchContestBannerAiImage(
  input: string,
  options: { timeoutMs?: number; maxBytes: number },
) {
  const timeoutMs = Math.min(Math.max(options.timeoutMs || 30_000, 1_000), 60_000);
  const maxBytes = Math.min(Math.max(options.maxBytes, 64 * 1024), 16 * 1024 * 1024);
  const deadline = Date.now() + timeoutMs;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new OpsApiError(502, 'AI 이미지 공급자가 올바르지 않은 결과 주소를 반환했습니다.');
  }

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    validateRemoteUrl(url);
    const address = await resolvePublicAddress(url, deadline);
    const response = await requestImageOnce(url, address, deadline, maxBytes);
    if (response.redirectUrl) {
      if (redirectCount === MAX_REDIRECTS) {
        throw new OpsApiError(502, 'AI 결과 이미지 리디렉션 횟수가 너무 많습니다.');
      }
      url = response.redirectUrl;
      continue;
    }
    if (!response.bytes || !response.contentType) {
      throw new OpsApiError(502, 'AI 결과 이미지를 가져오지 못했습니다.');
    }
    return { bytes: response.bytes, contentType: response.contentType };
  }

  throw new OpsApiError(502, 'AI 결과 이미지를 가져오지 못했습니다.');
}
