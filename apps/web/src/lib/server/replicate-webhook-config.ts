type ReplicateWebhookConfigEnvironment = {
  NODE_ENV?: string;
  REPLICATE_WEBHOOK_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
};

export type ReplicateImageWebhookConfig = {
  webhook?: string;
  webhook_events_filter?: ['completed'];
};

/**
 * Spread this object into both Replicate prediction POST variants.
 * In local development it returns an empty object unless an HTTPS URL is set.
 */
export function getReplicateImageWebhookConfig(
  environment: ReplicateWebhookConfigEnvironment = process.env,
): ReplicateImageWebhookConfig {
  const configured = environment.REPLICATE_WEBHOOK_URL?.trim();
  const appOrigin = environment.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured && !appOrigin) {
    if (environment.NODE_ENV === 'production') {
      throw new Error('NEXT_PUBLIC_APP_URL or REPLICATE_WEBHOOK_URL must be configured');
    }
    return {};
  }

  let webhook: URL;
  try {
    webhook = configured
      ? new URL(configured)
      : new URL('/api/webhooks/replicate', appOrigin!);
  } catch {
    throw new Error('REPLICATE_WEBHOOK_URL must be an absolute HTTPS URL');
  }
  if (webhook.protocol !== 'https:') {
    if (environment.NODE_ENV === 'production' || configured) {
      throw new Error('REPLICATE_WEBHOOK_URL must use HTTPS');
    }
    return {};
  }
  webhook.hash = '';
  return { webhook: webhook.toString(), webhook_events_filter: ['completed'] };
}
