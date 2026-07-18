import { lookup } from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import sharp from 'sharp';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_DIMENSION = 8192;

const DEFAULT_ALLOWED_HOST_RULES = [
  'replicate.delivery',
  '*.replicate.delivery',
  'image.pollinations.ai',
  '*.r2.cloudflarestorage.com',
  '*.supabase.co',
] as const;

type InputImageFormat = 'jpeg' | 'png' | 'gif' | 'webp';

const INPUT_MIME_TYPES: ReadonlyMap<string, InputImageFormat> = new Map([
  ['image/jpeg', 'jpeg'],
  ['image/png', 'png'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
] as const);

type RemoteResponse = {
  body?: Buffer;
  contentType?: string;
  redirectUrl?: URL;
};

export type VerifiedRemoteImage = {
  bytes: Buffer;
  contentType: 'image/webp';
  extension: 'webp';
  sourceContentType: string;
};

export type FetchRemoteImageOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowedHostRules?: readonly string[];
  allowAnyPublicHost?: boolean;
};

export class RemoteImageError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'RemoteImageError';
    this.status = status;
  }
}

function normalizeHostname(hostname: string) {
  return hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

function configuredHostRules() {
  const extraRules = (process.env.REMOTE_IMAGE_ALLOWED_HOSTS || '')
    .split(',')
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_HOST_RULES, ...extraRules];
}

function hostnameMatchesRule(hostname: string, rule: string) {
  if (rule.startsWith('*.')) {
    const suffix = rule.slice(2);
    return hostname.length > suffix.length && hostname.endsWith(`.${suffix}`);
  }
  return hostname === rule;
}

export function isAllowedRemoteImageHostname(
  hostname: string,
  rules: readonly string[] = configuredHostRules()
) {
  const normalized = normalizeHostname(hostname);
  return rules.some((rule) => hostnameMatchesRule(normalized, rule));
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
    const pieces = half.split(':');
    const values: number[] = [];

    for (const piece of pieces) {
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

  if (halves.length === 1) {
    return left.length === 8 ? left : null;
  }

  const zeroCount = 8 - left.length - right.length;
  if (zeroCount < 1) return null;
  return [...left, ...Array<number>(zeroCount).fill(0), ...right];
}

function isPublicIpv6(address: string) {
  const parts = parseIpv6(address);
  if (!parts || parts.length !== 8) return false;

  const first = parts[0];
  const second = parts[1];

  // Public HTTPS images only need globally routable unicast space (2000::/3).
  if ((first & 0xe000) !== 0x2000) return false;
  // Documentation, transition, and special-purpose ranges are deliberately denied.
  if (first === 0x2001 && second === 0x0000) return false;
  if (first === 0x2001 && second === 0x000d && parts[2] === 0x0b08) return false;
  if (first === 0x2001 && second === 0x0010) return false;
  if (first === 0x2001 && second === 0x0020) return false;
  if (first === 0x2001 && second === 0x0db8) return false;
  if (first === 0x2002) return false;
  return true;
}

export function isPublicIpAddress(address: string) {
  const normalized = normalizeHostname(address);
  const family = net.isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family === 6) return isPublicIpv6(normalized);
  return false;
}

function validateUrl(url: URL, options: FetchRemoteImageOptions) {
  if (url.href.length > 4_096) {
    throw new RemoteImageError(400, '이미지 URL이 너무 깁니다.');
  }
  if (url.protocol !== 'https:') {
    throw new RemoteImageError(400, 'HTTPS 이미지 URL만 사용할 수 있습니다.');
  }
  if (url.username || url.password) {
    throw new RemoteImageError(400, '인증 정보가 포함된 이미지 URL은 사용할 수 없습니다.');
  }
  if (url.port && url.port !== '443') {
    throw new RemoteImageError(400, '표준 HTTPS 포트의 이미지 URL만 사용할 수 있습니다.');
  }

  const hostname = normalizeHostname(url.hostname);
  const allowAnyPublicHost = options.allowAnyPublicHost
    ?? process.env.REMOTE_IMAGE_ALLOW_ANY_PUBLIC_HOST === 'true';
  const rules = options.allowedHostRules || configuredHostRules();
  if (!allowAnyPublicHost && !isAllowedRemoteImageHostname(hostname, rules)) {
    throw new RemoteImageError(400, '허용된 이미지 호스트의 URL만 사용할 수 있습니다.');
  }

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new RemoteImageError(400, '내부 네트워크의 이미지 URL은 사용할 수 없습니다.');
  }
}

async function resolvePublicAddress(url: URL, deadline: number) {
  const hostname = normalizeHostname(url.hostname);
  const literalFamily = net.isIP(hostname);
  let addresses: Array<{ address: string; family: number }>;

  if (literalFamily) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new RemoteImageError(504, '원격 이미지 요청 시간이 초과되었습니다.');
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      addresses = await Promise.race([
        lookup(hostname, { all: true, verbatim: false }),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new RemoteImageError(504, '원격 이미지 요청 시간이 초과되었습니다.')),
            remainingMs
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  if (addresses.length === 0 || addresses.some((entry) => !isPublicIpAddress(entry.address))) {
    throw new RemoteImageError(400, '공개 인터넷 이미지 주소만 사용할 수 있습니다.');
  }

  return [...addresses].sort((left, right) => left.family - right.family)[0];
}

function normalizedContentType(value: string | undefined) {
  return value?.split(';', 1)[0]?.trim().toLowerCase() || '';
}

function requestOnce(
  url: URL,
  address: { address: string; family: number },
  deadline: number,
  maxBytes: number
): Promise<RemoteResponse> {
  return new Promise((resolve, reject) => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      reject(new RemoteImageError(504, '원격 이미지 요청 시간이 초과되었습니다.'));
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
    const request = https.request(
      {
        protocol: 'https:',
        hostname: address.address,
        family: address.family,
        port: 443,
        servername: net.isIP(originalHostname) ? undefined : originalHostname,
        method: 'GET',
        path: `${url.pathname}${url.search}`,
        headers: {
          Accept: 'image/jpeg, image/png, image/gif, image/webp',
          Host: url.host,
          'User-Agent': 'NovelVerse-Image-Proxy/1.0',
        },
        rejectUnauthorized: true,
      },
      (response) => {
        const status = response.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = response.headers.location;
          response.destroy();
          if (!location) {
            settle(() => reject(new RemoteImageError(502, '이미지 리디렉션 주소가 올바르지 않습니다.')));
            return;
          }
          try {
            settle(() => resolve({ redirectUrl: new URL(location, url) }));
          } catch {
            settle(() => reject(new RemoteImageError(502, '이미지 리디렉션 주소가 올바르지 않습니다.')));
          }
          return;
        }

        if (status !== 200) {
          response.destroy();
          settle(() => reject(new RemoteImageError(502, '원격 이미지 서버가 요청을 처리하지 못했습니다.')));
          return;
        }

        const contentLength = Number(response.headers['content-length']);
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          response.destroy();
          settle(() => reject(new RemoteImageError(413, '원격 이미지 파일이 너무 큽니다.')));
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
            settle(() => reject(new RemoteImageError(413, '원격 이미지 파일이 너무 큽니다.')));
            return;
          }
          chunks.push(buffer);
        });
        response.on('end', () => {
          settle(() => resolve({
            body: Buffer.concat(chunks, totalBytes),
            contentType: normalizedContentType(response.headers['content-type']),
          }));
        });
        response.on('error', () => {
          settle(() => reject(new RemoteImageError(502, '원격 이미지를 읽지 못했습니다.')));
        });
      }
    );

    const hardTimeout = setTimeout(() => {
      request.destroy();
      settle(() => reject(new RemoteImageError(504, '원격 이미지 요청 시간이 초과되었습니다.')));
    }, remainingMs);
    request.on('error', (error) => {
      if (settled) return;
      const status = (error as NodeJS.ErrnoException).code === 'ETIMEDOUT' ? 504 : 502;
      settle(() => reject(new RemoteImageError(status, status === 504
        ? '원격 이미지 요청 시간이 초과되었습니다.'
        : '원격 이미지 서버에 연결하지 못했습니다.')));
    });
    request.end();
  });
}

function detectImageFormat(bytes: Buffer): InputImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (bytes.length >= 6) {
    const header = bytes.subarray(0, 6).toString('ascii');
    if (header === 'GIF87a' || header === 'GIF89a') return 'gif';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

async function verifyAndReencode(body: Buffer, contentType: string, maxBytes: number) {
  const expectedFormat = INPUT_MIME_TYPES.get(contentType);
  if (!expectedFormat) {
    throw new RemoteImageError(415, 'JPEG, PNG, GIF, WEBP 이미지만 사용할 수 있습니다.');
  }

  const detectedFormat = detectImageFormat(body);
  if (!detectedFormat || detectedFormat !== expectedFormat) {
    throw new RemoteImageError(415, '이미지 형식과 파일 내용이 일치하지 않습니다.');
  }

  try {
    const pipeline = sharp(body, {
      failOn: 'warning',
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true,
    });
    const metadata = await pipeline.metadata();
    if (
      metadata.format !== detectedFormat ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_DIMENSION ||
      metadata.height > MAX_DIMENSION ||
      metadata.width * metadata.height > MAX_INPUT_PIXELS
    ) {
      throw new RemoteImageError(415, '지원하지 않는 이미지 크기 또는 형식입니다.');
    }

    const output = await pipeline
      .rotate()
      .webp({ quality: 88, effort: 4 })
      .toBuffer();
    if (output.byteLength > maxBytes) {
      throw new RemoteImageError(413, '변환된 이미지 파일이 너무 큽니다.');
    }
    return output;
  } catch (error) {
    if (error instanceof RemoteImageError) throw error;
    throw new RemoteImageError(415, '손상되었거나 지원하지 않는 이미지입니다.');
  }
}

export async function normalizeUploadedImage(
  body: Buffer,
  contentType: string,
  maxBytes = DEFAULT_MAX_BYTES
): Promise<VerifiedRemoteImage> {
  const boundedMaxBytes = Math.min(Math.max(maxBytes, 64 * 1024), 16 * 1024 * 1024);
  if (body.byteLength === 0) {
    throw new RemoteImageError(400, '비어 있는 이미지 파일은 업로드할 수 없습니다.');
  }
  if (body.byteLength > boundedMaxBytes) {
    throw new RemoteImageError(413, '이미지 파일이 너무 큽니다.');
  }

  const normalizedType = normalizedContentType(contentType);
  const bytes = await verifyAndReencode(body, normalizedType, boundedMaxBytes);
  return {
    bytes,
    contentType: 'image/webp',
    extension: 'webp',
    sourceContentType: normalizedType,
  };
}

export async function fetchVerifiedRemoteImage(
  input: string,
  options: FetchRemoteImageOptions = {}
): Promise<VerifiedRemoteImage> {
  const timeoutMs = Math.min(Math.max(options.timeoutMs || DEFAULT_TIMEOUT_MS, 1_000), 30_000);
  const maxBytes = Math.min(Math.max(options.maxBytes || DEFAULT_MAX_BYTES, 64 * 1024), 16 * 1024 * 1024);
  const maxRedirects = Math.min(Math.max(options.maxRedirects ?? DEFAULT_MAX_REDIRECTS, 0), 5);
  const deadline = Date.now() + timeoutMs;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new RemoteImageError(400, '올바른 이미지 URL을 입력해 주세요.');
  }

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    validateUrl(url, options);

    let address: { address: string; family: number };
    try {
      address = await resolvePublicAddress(url, deadline);
    } catch (error) {
      if (error instanceof RemoteImageError) throw error;
      throw new RemoteImageError(502, '이미지 호스트 주소를 확인하지 못했습니다.');
    }

    const response = await requestOnce(url, address, deadline, maxBytes);
    if (response.redirectUrl) {
      if (redirectCount === maxRedirects) {
        throw new RemoteImageError(502, '이미지 리디렉션 횟수가 너무 많습니다.');
      }
      url = response.redirectUrl;
      continue;
    }

    if (!response.body || !response.contentType) {
      throw new RemoteImageError(415, '원격 서버가 이미지 형식을 제공하지 않았습니다.');
    }

    const bytes = await verifyAndReencode(response.body, response.contentType, maxBytes);
    return {
      bytes,
      contentType: 'image/webp',
      extension: 'webp',
      sourceContentType: response.contentType,
    };
  }

  throw new RemoteImageError(502, '원격 이미지를 가져오지 못했습니다.');
}
