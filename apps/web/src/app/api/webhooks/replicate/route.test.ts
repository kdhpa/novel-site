import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  parse: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  release: vi.fn(),
  extractUrl: vi.fn(),
  findJob: vi.fn(),
  processUpdate: vi.fn(),
  failureDetails: vi.fn(),
  log: vi.fn(),
}));

const MockProviderMismatchError = vi.hoisted(() => class extends Error {});

vi.mock('@novelverse/shared', () => ({ logServerError: mocks.log }));
vi.mock('@/lib/ai', () => ({
  getImagePredictionFailureDetails: mocks.failureDetails,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { imageGenerationJob: { findUnique: mocks.findJob } },
}));
vi.mock('@/lib/server/image-job-finalization', () => ({
  ImageJobProviderMismatchError: MockProviderMismatchError,
  processImageProviderUpdate: mocks.processUpdate,
}));
vi.mock('@/lib/server/replicate-webhook', () => ({
  authenticateReplicateWebhook: mocks.authenticate,
  claimReplicateWebhookDelivery: mocks.claim,
  completeReplicateWebhookDelivery: mocks.complete,
  extractReplicateWebhookImageUrl: mocks.extractUrl,
  parseReplicateWebhookPrediction: mocks.parse,
  releaseReplicateWebhookDelivery: mocks.release,
}));

import { ApiError } from '@/lib/server/api';
import { POST } from './route';

const job = {
  id: 'job-1',
  providerPredictionId: 'prediction-1',
  userId: 'user-1',
  type: 'cover',
  status: 'processing',
  imageUrl: null,
};

function request() {
  return new Request('https://novelverse.example/api/webhooks/replicate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

describe('Replicate completion webhook route', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.authenticate.mockResolvedValue({
      webhookId: 'msg-1',
      webhookTimestamp: 1_774_000_000,
      rawBody: new TextEncoder().encode('{}'),
    });
    mocks.parse.mockReturnValue({
      id: 'prediction-1',
      status: 'succeeded',
      output: ['https://replicate.delivery/output.webp'],
      error: null,
    });
    mocks.claim.mockResolvedValue('claimed');
    mocks.complete.mockResolvedValue(undefined);
    mocks.release.mockResolvedValue(undefined);
    mocks.findJob.mockResolvedValue(job);
    mocks.extractUrl.mockReturnValue('https://replicate.delivery/output.webp');
    mocks.failureDetails.mockReturnValue(null);
    mocks.processUpdate.mockResolvedValue({
      job: { ...job, status: 'succeeded', imageUrl: '/uploads/result.webp' },
      status: 'succeeded',
      retryAfterMs: null,
      exposeError: false,
      retryWebhook: false,
    });
  });

  it('rejects unsigned or stale requests before reading DB state', async () => {
    mocks.authenticate.mockRejectedValue(new ApiError(401, 'invalid webhook'));

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.findJob).not.toHaveBeenCalled();
  });

  it('acknowledges a completed replay without repeating side effects', async () => {
    mocks.claim.mockResolvedValue('completed');

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(mocks.findJob).not.toHaveBeenCalled();
    expect(mocks.processUpdate).not.toHaveBeenCalled();
  });

  it('matches by provider prediction ID and completes permanent finalization', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.findJob).toHaveBeenCalledWith({
      where: { providerPredictionId: 'prediction-1' },
    });
    expect(mocks.processUpdate).toHaveBeenCalledWith(job, {
      predictionId: 'prediction-1',
      status: 'succeeded',
      imageUrl: 'https://replicate.delivery/output.webp',
      failureMessage: undefined,
      failureCode: undefined,
    }, {
      allowEarlyFinalizationRetry: true,
    });
    expect(mocks.complete).toHaveBeenCalledWith('msg-1');
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it.each(['failed', 'canceled'] as const)(
    'passes a signed terminal %s event through the shared state transition',
    async (status) => {
      mocks.parse.mockReturnValue({
        id: 'prediction-1',
        status,
        output: null,
        error: status === 'failed' ? 'provider failed' : null,
      });
      mocks.extractUrl.mockReturnValue(null);
      mocks.failureDetails.mockReturnValue({
        code: status,
        userMessage: `safe ${status} message`,
        retryable: false,
      });
      mocks.processUpdate.mockResolvedValue({
        job: { ...job, status },
        status,
        retryAfterMs: null,
        exposeError: true,
        retryWebhook: false,
      });

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(mocks.processUpdate).toHaveBeenCalledWith(
        job,
        expect.objectContaining({
          predictionId: 'prediction-1',
          status,
          imageUrl: null,
          failureMessage: `safe ${status} message`,
          failureCode: `provider_${status}`,
        }),
        { allowEarlyFinalizationRetry: true },
      );
      expect(mocks.complete).toHaveBeenCalledWith('msg-1');
    },
  );

  it('returns a retryable response when the prediction row is not visible yet', async () => {
    mocks.findJob.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('5');
    expect(mocks.release).toHaveBeenCalledWith('msg-1');
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('releases the delivery claim when permanent storage asks for a retry', async () => {
    mocks.processUpdate.mockResolvedValue({
      job,
      status: 'processing',
      retryAfterMs: 15_000,
      exposeError: false,
      retryWebhook: true,
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.release).toHaveBeenCalledWith('msg-1');
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
