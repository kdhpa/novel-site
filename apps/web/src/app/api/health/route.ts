import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logServerError } from '@novelverse/shared';
import { validateProxyTrustConfiguration } from '@novelverse/shared/proxy';
import { hasPersistentLocalStorage, hasSupabaseConfig } from '@/lib/supabase';
import { geminiPolicyHealth } from '@/lib/server/ai-provider-policy';
import { isAuthEmailConfigured } from '@/lib/server/auth-email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type HealthCheck = {
  status: 'up' | 'down' | 'degraded';
  latencyMs?: number;
  detail?: string;
};

function storageCheck(): HealthCheck {
  const persistentRequired =
    process.env.NODE_ENV === 'production' && process.env.ALLOW_EPHEMERAL_STORAGE !== 'true';

  if (hasSupabaseConfig) return { status: 'up', detail: 'remote' };
  if (hasPersistentLocalStorage) return { status: 'up', detail: 'persistent-local' };
  if (persistentRequired) return { status: 'down', detail: 'persistent storage is not configured' };
  return {
    status: 'degraded',
    detail: process.env.NODE_ENV === 'production'
      ? 'ephemeral storage explicitly allowed'
      : 'development local storage',
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

function authEmailCheck(): HealthCheck {
  if (process.env.NODE_ENV !== 'production') {
    return { status: 'up', detail: 'development delivery fallback' };
  }
  return isAuthEmailConfigured()
    ? { status: 'up', detail: 'transactional email configured' }
    : {
        status: 'down',
        detail: 'RESEND_API_KEY and EMAIL_FROM are required for account privacy step-up',
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
  const aiProviderPolicy = geminiPolicyHealth();
  const retentionPolicy = retentionPolicyCheck();
  const authEmail = authEmailCheck();
  const privacyContact = privacyContactCheck();
  const checks = {
    database,
    storage,
    proxyTrust,
    aiProviderPolicy,
    retentionPolicy,
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
