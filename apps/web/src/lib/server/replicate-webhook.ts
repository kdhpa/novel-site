import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError } from './api';

const REPLICATE_WEBHOOK_SECRET_URL =
  'https://api.replicate.com/v1/webhooks/default/secret';
const MAX_WEBHOOK_BYTES = 1024 * 1024;
const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;
const WEBHOOK_DELIVERY_TTL_MS = 10 * 60 * 1000;
const SECRET_CACHE_TTL_MS = 60 * 60 * 1000;

type ReplicateWebhookEnvironment = {
  REPLICATE_API_TOKEN?: string;
  REPLICATE_WEBHOOK_SIGNING_SECRET?: string;
};

type CachedSecret = { value: string; expiresAt: number };
const webhookGlobal = globalThis as typeof globalThis & {
  __novelverseReplicateWebhookSecret?: CachedSecret;
};

export type ReplicateWebhookPrediction = {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'successful' | 'failed' |
    'canceled' | 'cancelled' | 'aborted';
  output: unknown;
  error?: string | null;
  detail?: string;
  title?: string;
};

const predictionSchema = z.object({
  id: z.string().trim().min(1).max(256),
  status: z.enum([
    'starting',
    'processing',
    'succeeded',
    'successful',
    'failed',
    'canceled',
    'cancelled',
    'aborted',
  ]),
  output: z.unknown().optional().nullable(),
  error: z.string().max(2_000).nullable().optional(),
  detail: z.string().max(2_000).optional(),
  title: z.string().max(500).optional(),
}).passthrough();

function decodeBase64(value: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, 'base64');
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function signingKey(signingSecret: string) {
  const trimmed = signingSecret.trim();
  if (!trimmed.startsWith('whsec_')) {
    throw new ApiError(503, 'Replicate 웹훅 서명 키가 올바르지 않습니다.');
  }
  const decoded = decodeBase64(trimmed.slice('whsec_'.length));
  if (!decoded || decoded.length < 16) {
    throw new ApiError(503, 'Replicate 웹훅 서명 키가 올바르지 않습니다.');
  }
  return decoded;
}

function boundedWebhookId(value: string | null) {
  if (!value || !/^[A-Za-z0-9_-]{1,256}$/.test(value)) {
    throw new ApiError(400, 'Replicate 웹훅 식별자가 올바르지 않습니다.');
  }
  return value;
}

function boundedWebhookTimestamp(value: string | null, nowMs: number) {
  if (!value || !/^\d{1,12}$/.test(value)) {
    throw new ApiError(400, 'Replicate 웹훅 시간이 올바르지 않습니다.');
  }
  const timestamp = Number(value);
  const nowSeconds = Math.floor(nowMs / 1_000);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS
  ) {
    throw new ApiError(401, 'Replicate 웹훅 요청 시간이 허용 범위를 벗어났습니다.');
  }
  return { raw: value, value: timestamp };
}

function signatureCandidates(value: string | null) {
  if (!value || value.length > 4_096) {
    throw new ApiError(401, 'Replicate 웹훅 서명이 필요합니다.');
  }
  const signatures: Uint8Array[] = [];
  for (const candidate of value.split(/\s+/)) {
    const [version, encoded] = candidate.split(',', 2);
    if (version !== 'v1' || !encoded) continue;
    const decoded = decodeBase64(encoded);
    if (decoded) signatures.push(decoded);
  }
  return signatures;
}

export function verifyReplicateWebhookSignature(input: {
  rawBody: Uint8Array;
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
  signingSecret: string;
  nowMs?: number;
}) {
  const webhookId = boundedWebhookId(input.webhookId);
  const timestamp = boundedWebhookTimestamp(
    input.webhookTimestamp,
    input.nowMs ?? Date.now(),
  );
  const expected = crypto
    .createHmac('sha256', signingKey(input.signingSecret))
    .update(`${webhookId}.${timestamp.raw}.`)
    .update(input.rawBody)
    .digest();

  const verified = signatureCandidates(input.webhookSignature).some((candidate) =>
    candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected),
  );
  if (!verified) {
    throw new ApiError(401, 'Replicate 웹훅 서명이 올바르지 않습니다.');
  }

  return { webhookId, webhookTimestamp: timestamp.value };
}

async function fetchSigningSecret(
  token: string,
  fetcher: typeof fetch,
) {
  let response: Response;
  try {
    response = await fetcher(REPLICATE_WEBHOOK_SECRET_URL, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(503, 'Replicate 웹훅 서명 키를 확인하지 못했습니다.');
  }
  if (!response.ok) {
    throw new ApiError(503, 'Replicate 웹훅 서명 키를 확인하지 못했습니다.');
  }

  let body: unknown;
  try {
    body = await response.json() as unknown;
  } catch {
    throw new ApiError(503, 'Replicate 웹훅 서명 키 응답을 읽지 못했습니다.');
  }
  const key = body && typeof body === 'object' && !Array.isArray(body) &&
    typeof (body as { key?: unknown }).key === 'string'
    ? (body as { key: string }).key.trim()
    : '';
  signingKey(key);
  return key;
}

export async function getReplicateWebhookSigningSecret(
  environment: ReplicateWebhookEnvironment = process.env as ReplicateWebhookEnvironment,
  fetcher: typeof fetch = fetch,
) {
  const configured = environment.REPLICATE_WEBHOOK_SIGNING_SECRET?.trim();
  if (configured) {
    signingKey(configured);
    return configured;
  }

  const now = Date.now();
  const cached = webhookGlobal.__novelverseReplicateWebhookSecret;
  if (cached && cached.expiresAt > now) return cached.value;

  const token = environment.REPLICATE_API_TOKEN?.trim();
  if (!token) {
    throw new ApiError(503, 'Replicate 웹훅 검증 설정이 필요합니다.');
  }
  const value = await fetchSigningSecret(token, fetcher);
  webhookGlobal.__novelverseReplicateWebhookSecret = {
    value,
    expiresAt: now + SECRET_CACHE_TTL_MS,
  };
  return value;
}

async function readRawBody(request: Request) {
  const contentType = request.headers.get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== 'application/json' && !contentType?.endsWith('+json')) {
    throw new ApiError(415, 'JSON 형식의 Replicate 웹훅만 처리할 수 있습니다.');
  }

  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    throw new ApiError(413, 'Replicate 웹훅 본문이 너무 큽니다.');
  }
  if (!request.body) throw new ApiError(400, 'Replicate 웹훅 본문이 필요합니다.');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_WEBHOOK_BYTES) {
        await reader.cancel();
        throw new ApiError(413, 'Replicate 웹훅 본문이 너무 큽니다.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new ApiError(400, 'Replicate 웹훅 본문이 필요합니다.');

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function authenticateReplicateWebhook(
  request: Request,
  options: {
    signingSecret?: string;
    nowMs?: number;
    environment?: ReplicateWebhookEnvironment;
    fetcher?: typeof fetch;
  } = {},
) {
  const rawBody = await readRawBody(request);
  const signingSecret = options.signingSecret || await getReplicateWebhookSigningSecret(
    options.environment,
    options.fetcher,
  );
  const metadata = verifyReplicateWebhookSignature({
    rawBody,
    webhookId: request.headers.get('webhook-id'),
    webhookTimestamp: request.headers.get('webhook-timestamp'),
    webhookSignature: request.headers.get('webhook-signature'),
    signingSecret,
    nowMs: options.nowMs,
  });
  return { ...metadata, rawBody };
}

export function parseReplicateWebhookPrediction(rawBody: Uint8Array) {
  let value: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(rawBody);
    value = JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, 'Replicate 웹훅 본문이 올바른 JSON이 아닙니다.');
  }

  const parsed = predictionSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, 'Replicate prediction 응답 형식이 올바르지 않습니다.');
  }
  return {
    id: parsed.data.id,
    status: parsed.data.status,
    output: parsed.data.output ?? null,
    error: parsed.data.error,
    detail: parsed.data.detail,
    title: parsed.data.title,
  } satisfies ReplicateWebhookPrediction;
}

export function extractReplicateWebhookImageUrl(output: unknown): string | null {
  if (typeof output === 'string' && output.length <= 8_192) return output;
  if (Array.isArray(output)) {
    const stringUrl = output.find(
      (item): item is string => typeof item === 'string' && item.length <= 8_192,
    );
    if (stringUrl) return stringUrl;
    const objectUrl = output.find((item): item is { url: string } =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item) &&
      typeof (item as { url?: unknown }).url === 'string' &&
      ((item as { url: string }).url.length <= 8_192),
    );
    return objectUrl?.url || null;
  }
  if (
    output && typeof output === 'object' && !Array.isArray(output) &&
    typeof (output as { url?: unknown }).url === 'string' &&
    (output as { url: string }).url.length <= 8_192
  ) {
    return (output as { url: string }).url;
  }
  return null;
}

function webhookDeliveryKey(webhookId: string) {
  const digest = crypto.createHash('sha256').update(webhookId).digest('hex');
  return `replicate-webhook:v1:${digest}`;
}

export async function claimReplicateWebhookDelivery(
  webhookId: string,
  now = new Date(),
): Promise<'claimed' | 'processing' | 'completed'> {
  const key = webhookDeliveryKey(webhookId);
  const resetAt = new Date(now.getTime() + WEBHOOK_DELIVERY_TTL_MS);
  try {
    await prisma.rateLimitBucket.create({
      data: { key, count: 1, resetAt },
    });
    return 'claimed';
  } catch (error) {
    const existing = await prisma.rateLimitBucket.findUnique({ where: { key } });
    if (!existing) throw error;
    if (existing.resetAt <= now) {
      const reclaimed = await prisma.rateLimitBucket.updateMany({
        where: { key, resetAt: { lte: now } },
        data: { count: 1, resetAt },
      });
      if (reclaimed.count === 1) return 'claimed';
      const raced = await prisma.rateLimitBucket.findUnique({ where: { key } });
      return raced && raced.count >= 2 ? 'completed' : 'processing';
    }
    return existing.count >= 2 ? 'completed' : 'processing';
  }
}

export async function completeReplicateWebhookDelivery(webhookId: string) {
  await prisma.rateLimitBucket.updateMany({
    where: { key: webhookDeliveryKey(webhookId), count: 1 },
    data: { count: 2 },
  });
}

export async function releaseReplicateWebhookDelivery(webhookId: string) {
  await prisma.rateLimitBucket.deleteMany({
    where: { key: webhookDeliveryKey(webhookId), count: 1 },
  });
}
