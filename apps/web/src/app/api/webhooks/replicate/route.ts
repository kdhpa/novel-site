import { NextResponse } from 'next/server';
import { logServerError } from '@novelverse/shared';
import { getImagePredictionFailureDetails } from '@/lib/ai';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/server/api';
import {
  ImageJobProviderMismatchError,
  processImageProviderUpdate,
} from '@/lib/server/image-job-finalization';
import {
  isSupportedImageJobType,
} from '@/lib/server/image-job-state';
import {
  authenticateReplicateWebhook,
  claimReplicateWebhookDelivery,
  completeReplicateWebhookDelivery,
  extractReplicateWebhookImageUrl,
  parseReplicateWebhookPrediction,
  releaseReplicateWebhookDelivery,
} from '@/lib/server/replicate-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TERMINAL_PROVIDER_STATUSES = new Set([
  'succeeded',
  'successful',
  'failed',
  'canceled',
  'cancelled',
  'aborted',
]);

function webhookResponse(
  status: number,
  body: { received: boolean; duplicate?: boolean; retry?: boolean },
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(body.retry ? { 'Retry-After': '5' } : {}),
    },
  });
}

export async function POST(request: Request) {
  let ownedDeliveryId: string | null = null;

  try {
    const authenticated = await authenticateReplicateWebhook(request);
    const prediction = parseReplicateWebhookPrediction(authenticated.rawBody);

    // The prediction creation call requests only completed events. A signed
    // intermediate event is harmless and must not consume its delivery ID.
    if (!TERMINAL_PROVIDER_STATUSES.has(prediction.status)) {
      return webhookResponse(202, { received: true });
    }

    const delivery = await claimReplicateWebhookDelivery(authenticated.webhookId);
    if (delivery === 'completed') {
      return webhookResponse(200, { received: true, duplicate: true });
    }
    if (delivery === 'processing') {
      return webhookResponse(503, { received: false, retry: true });
    }
    ownedDeliveryId = authenticated.webhookId;

    const job = await prisma.imageGenerationJob.findUnique({
      where: { providerPredictionId: prediction.id },
    });
    if (!job || !isSupportedImageJobType(job.type)) {
      // A very fast model can complete before the create request has stored
      // the returned provider ID. Releasing the claim lets Replicate retry.
      await releaseReplicateWebhookDelivery(ownedDeliveryId);
      ownedDeliveryId = null;
      return webhookResponse(503, { received: false, retry: true });
    }

    const failure = getImagePredictionFailureDetails(prediction);
    const finalized = await processImageProviderUpdate(job, {
      predictionId: prediction.id,
      status: prediction.status,
      imageUrl: extractReplicateWebhookImageUrl(prediction.output),
      failureMessage: failure?.userMessage,
      failureCode: failure ? `provider_${failure.code}` : undefined,
    }, {
      allowEarlyFinalizationRetry: true,
    });

    if (finalized.retryWebhook) {
      await releaseReplicateWebhookDelivery(ownedDeliveryId);
      ownedDeliveryId = null;
      return webhookResponse(503, { received: false, retry: true });
    }

    await completeReplicateWebhookDelivery(ownedDeliveryId);
    ownedDeliveryId = null;
    return webhookResponse(200, { received: true });
  } catch (error) {
    if (ownedDeliveryId) {
      await releaseReplicateWebhookDelivery(ownedDeliveryId).catch((releaseError) => {
        logServerError('replicate-webhook-release', releaseError);
      });
    }

    if (error instanceof ImageJobProviderMismatchError) {
      return webhookResponse(409, { received: false });
    }
    if (error instanceof ApiError) {
      return webhookResponse(error.status, {
        received: false,
        retry: error.status >= 500,
      });
    }
    logServerError('replicate-webhook', error);
    return webhookResponse(500, { received: false, retry: true });
  }
}
