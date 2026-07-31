import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    rateLimitBucket: {
      create: dbMocks.create,
      findUnique: dbMocks.findUnique,
      updateMany: dbMocks.updateMany,
      deleteMany: dbMocks.deleteMany,
    },
  },
}));

import { ApiError } from './api';
import {
  authenticateReplicateWebhook,
  claimReplicateWebhookDelivery,
  completeReplicateWebhookDelivery,
  extractReplicateWebhookImageUrl,
  parseReplicateWebhookPrediction,
  releaseReplicateWebhookDelivery,
  verifyReplicateWebhookSignature,
} from './replicate-webhook';
import { getReplicateImageWebhookConfig } from './replicate-webhook-config';

const NOW_MS = Date.parse('2026-07-22T00:00:00.000Z');
const TIMESTAMP = String(Math.floor(NOW_MS / 1_000));
const WEBHOOK_ID = 'msg_prediction_completed_1';
const SECRET_BYTES = Buffer.from('replicate-webhook-test-secret-key');
const SIGNING_SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;

function signedRequest(rawBody: Uint8Array, timestamp = TIMESTAMP) {
  const signature = crypto
    .createHmac('sha256', SECRET_BYTES)
    .update(`${WEBHOOK_ID}.${timestamp}.`)
    .update(rawBody)
    .digest('base64');
  return {
    rawBody,
    webhookId: WEBHOOK_ID,
    webhookTimestamp: timestamp,
    webhookSignature: `v2,${Buffer.alloc(32).toString('base64')} v1,${signature}`,
    signingSecret: SIGNING_SECRET,
    nowMs: NOW_MS,
  };
}

describe('Replicate webhook verification', () => {
  beforeEach(() => {
    for (const mock of Object.values(dbMocks)) mock.mockReset();
    dbMocks.updateMany.mockResolvedValue({ count: 1 });
    dbMocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('verifies the v1 HMAC over id.timestamp.raw-body without reserializing JSON', () => {
    const rawBody = new TextEncoder().encode('{"id":"prediction-1", "status":"succeeded"}');

    expect(verifyReplicateWebhookSignature(signedRequest(rawBody))).toEqual({
      webhookId: WEBHOOK_ID,
      webhookTimestamp: Number(TIMESTAMP),
    });

    const changedBody = new TextEncoder().encode('{"id":"prediction-1","status":"succeeded"}');
    expect(() => verifyReplicateWebhookSignature({
      ...signedRequest(rawBody),
      rawBody: changedBody,
    })).toThrow(expect.objectContaining<Partial<ApiError>>({ status: 401 }));
  });

  it('rejects stale signed deliveries to bound replay attempts', () => {
    const rawBody = new TextEncoder().encode('{"id":"prediction-1","status":"failed"}');
    const staleTimestamp = String(Number(TIMESTAMP) - 301);

    expect(() => verifyReplicateWebhookSignature(
      signedRequest(rawBody, staleTimestamp),
    )).toThrow(expect.objectContaining<Partial<ApiError>>({ status: 401 }));
  });

  it('authenticates the exact Request bytes before JSON parsing', async () => {
    const rawText = '{"id":"prediction-1", "status":"succeeded"}';
    const rawBody = new TextEncoder().encode(rawText);
    const signed = signedRequest(rawBody);
    const authenticated = await authenticateReplicateWebhook(new Request(
      'https://novelverse.example/api/webhooks/replicate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'webhook-id': WEBHOOK_ID,
          'webhook-timestamp': TIMESTAMP,
          'webhook-signature': signed.webhookSignature,
        },
        body: rawText,
      },
    ), {
      signingSecret: SIGNING_SECRET,
      nowMs: NOW_MS,
    });

    expect(authenticated.webhookId).toBe(WEBHOOK_ID);
    expect(new TextDecoder().decode(authenticated.rawBody)).toBe(rawText);
  });

  it('validates terminal prediction payloads and extracts supported output shapes', () => {
    const rawBody = new TextEncoder().encode(JSON.stringify({
      id: 'prediction-1',
      status: 'succeeded',
      output: [{ url: 'https://replicate.delivery/output.webp' }],
      input: { prompt: 'must not be persisted by the parser' },
    }));
    const prediction = parseReplicateWebhookPrediction(rawBody);

    expect(prediction.id).toBe('prediction-1');
    expect(prediction).not.toHaveProperty('input');
    expect(extractReplicateWebhookImageUrl(prediction.output)).toBe(
      'https://replicate.delivery/output.webp',
    );
  });

  it('tracks claimed, in-progress and completed delivery IDs across instances', async () => {
    dbMocks.create.mockResolvedValueOnce({});
    await expect(claimReplicateWebhookDelivery(WEBHOOK_ID, new Date(NOW_MS)))
      .resolves.toBe('claimed');

    dbMocks.create.mockRejectedValueOnce(new Error('unique'));
    dbMocks.findUnique.mockResolvedValueOnce({
      count: 1,
      resetAt: new Date(NOW_MS + 60_000),
    });
    await expect(claimReplicateWebhookDelivery(WEBHOOK_ID, new Date(NOW_MS)))
      .resolves.toBe('processing');

    dbMocks.create.mockRejectedValueOnce(new Error('unique'));
    dbMocks.findUnique.mockResolvedValueOnce({
      count: 2,
      resetAt: new Date(NOW_MS + 60_000),
    });
    await expect(claimReplicateWebhookDelivery(WEBHOOK_ID, new Date(NOW_MS)))
      .resolves.toBe('completed');

    await completeReplicateWebhookDelivery(WEBHOOK_ID);
    await releaseReplicateWebhookDelivery(WEBHOOK_ID);
    expect(dbMocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ count: 1 }),
      data: { count: 2 },
    }));
    expect(dbMocks.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ count: 1 }),
    }));
  });

  it('builds the completed-only HTTPS prediction config for ai.ts', () => {
    expect(getReplicateImageWebhookConfig({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'https://novelverse.example/base',
    })).toEqual({
      webhook: 'https://novelverse.example/api/webhooks/replicate',
      webhook_events_filter: ['completed'],
    });
    expect(getReplicateImageWebhookConfig({
      NODE_ENV: 'development',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    })).toEqual({});
  });
});
