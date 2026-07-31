import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logServerError } from '@novelverse/shared';
import { validateProxyTrustConfiguration } from '@novelverse/shared/proxy';
import {
  hasPersistentLocalStorage,
  hasSupabaseConfig,
  hasSupabaseS3Config,
} from '@/lib/supabase';
import {
  geminiPolicyHealth,
  replicatePolicyHealth,
} from '@/lib/server/ai-provider-policy';
import { isGeminiAiEnabled } from '@novelverse/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type HealthCheck = {
  status: 'up' | 'down' | 'degraded';
  latencyMs?: number;
  detail?: string;
};

function storageCheck(): HealthCheck {
  if (hasSupabaseS3Config) return { status: 'up', detail: 'remote-s3' };
  if (hasSupabaseConfig) return { status: 'up', detail: 'remote' };
  if (hasPersistentLocalStorage) return { status: 'up', detail: 'persistent-local' };
  if (process.env.NODE_ENV === 'production') {
    return { status: 'down', detail: 'persistent storage is not configured' };
  }
  return {
    status: 'degraded',
    detail: 'development local storage',
  };
}

function proxyTrustCheck(): HealthCheck {
  try {
    const provider = validateProxyTrustConfiguration();
    if (process.env.NODE_ENV === 'production' && provider === 'none') {
      return {
        status: 'degraded',
        detail: 'client IP forwarding is disabled; shared rate-limit identity is in use',
      };
    }
    return { status: 'up', detail: provider };
  } catch (error) {
    return {
      status: 'down',
      detail: error instanceof Error ? error.message : 'invalid proxy trust configuration',
    };
  }
}

function retentionPolicyCheck(): HealthCheck {
  if (process.env.NODE_ENV !== 'production') {
    return { status: 'up', detail: 'development defaults' };
  }

  const backupDays = Number.parseInt(process.env.BACKUP_RETENTION_DAYS || '', 10);
  if (!Number.isFinite(backupDays) || backupDays < 1 || backupDays > 3_650) {
    return {
      status: 'down',
      detail: 'BACKUP_RETENTION_DAYS must declare the provider retention (1-3650)',
    };
  }
  return { status: 'up', detail: `${backupDays} day backup retention declared` };
}

function googleAuthCheck(): HealthCheck {
  if (process.env.NODE_ENV !== 'production') {
    return { status: 'up', detail: 'development configuration' };
  }

  return process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
    ? { status: 'up', detail: 'Google OAuth configured' }
    : {
        status: 'down',
        detail: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for sign-up',
      };
}

function authEmailCheck(): HealthCheck {
  const hasApiKey = Boolean(process.env.RESEND_API_KEY?.trim());
  const hasSender = Boolean(process.env.EMAIL_FROM?.trim());

  if (!hasApiKey && !hasSender) {
    return { status: 'up', detail: 'optional transactional email disabled' };
  }
  if (hasApiKey && hasSender) {
    return { status: 'up', detail: 'optional transactional email configured' };
  }
  return {
    status: 'down',
    detail: 'RESEND_API_KEY and EMAIL_FROM must be configured together or both omitted',
  };
}

function privacyContactCheck(): HealthCheck {
  if (process.env.NODE_ENV !== 'production') {
    return { status: 'up', detail: 'development placeholder allowed' };
  }

  const contact = process.env.NEXT_PUBLIC_PRIVACY_CONTACT?.trim() || '';
  const emailDomain = contact.split('@').at(-1)?.toLowerCase();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)
    && emailDomain !== 'example.com';
  let isHttpsUrl = false;
  try {
    const url = new URL(contact);
    isHttpsUrl = url.protocol === 'https:' && url.hostname !== 'example.com';
  } catch {
    // Invalid values are reported by the health response below.
  }

  return isEmail || isHttpsUrl
    ? { status: 'up', detail: 'public privacy request channel configured' }
    : {
        status: 'down',
        detail: 'NEXT_PUBLIC_PRIVACY_CONTACT must be an email address or HTTPS URL',
      };
}

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const startedAt = Date.now();
  let database: HealthCheck;

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { status: 'up', latencyMs: Date.now() - startedAt };
  } catch (error) {
    database = { status: 'down', latencyMs: Date.now() - startedAt };
    logServerError('health.database', error, { requestId });
  }

  const storage = storageCheck();
  const proxyTrust = proxyTrustCheck();
  const imageProvider = replicatePolicyHealth();
  let aiProviderPolicy: HealthCheck;
  try {
    aiProviderPolicy = geminiPolicyHealth(await isGeminiAiEnabled());
  } catch (error) {
    aiProviderPolicy = {
      status: 'down',
      detail: 'AI provider runtime setting could not be read',
    };
    logServerError('health.ai-provider-setting', error, { requestId });
  }
  const retentionPolicy = retentionPolicyCheck();
  const googleAuth = googleAuthCheck();
  const authEmail = authEmailCheck();
  const privacyContact = privacyContactCheck();
  const checks = {
    database,
    storage,
    proxyTrust,
    imageProvider,
    aiProviderPolicy,
    retentionPolicy,
    googleAuth,
    authEmail,
    privacyContact,
  };
  const healthy = Object.values(checks).every((check) => check.status !== 'down');
  const degraded = Object.values(checks).some((check) => check.status === 'degraded');

  return NextResponse.json(
    {
      status: healthy ? (degraded ? 'degraded' : 'ok') : 'unhealthy',
      release: process.env.RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null,
      requestId,
      timestamp: new Date().toISOString(),
      checks,
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Request-Id': requestId,
      },
    }
  );
}
