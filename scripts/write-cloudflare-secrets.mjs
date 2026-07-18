#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const APP_CONFIG = {
  web: {
    required: [
      'DATABASE_URL',
      'RELEASE_SHA',
      'NEXTAUTH_SECRET',
      'NEXTAUTH_URL',
      'NEXT_PUBLIC_APP_URL',
      'NEXT_PUBLIC_WEB_URL',
      'NEXT_PUBLIC_OPS_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'RESEND_API_KEY',
      'EMAIL_FROM',
      'BACKUP_RETENTION_DAYS',
      'NEXT_PUBLIC_PRIVACY_CONTACT',
      'CRON_SECRET',
    ],
    optional: [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_IMAGE_HOSTS',
      'REMOTE_IMAGE_ALLOWED_HOSTS',
      'AUTH_EMAIL_TIMEOUT_MS',
      'CONTENT_VIEW_RETENTION_DAYS',
      'IMAGE_JOB_RETENTION_DAYS',
      'MODERATION_RECORD_RETENTION_DAYS',
      'MAX_NOVELS_PER_USER',
      'MAX_CHAPTERS_PER_NOVEL',
      'MAX_CHARACTERS_PER_NOVEL',
      'REPLICATE_API_TOKEN',
      'REPLICATE_ANIME_MODEL_VERSION',
      'REPLICATE_ANIME_MODEL',
      'REPLICATE_IMAGE_TIMEOUT_SECONDS',
      'REPLICATE_HTTP_TIMEOUT_MS',
      'REPLICATE_IMAGE_POLL_INTERVAL_MS',
      'REPLICATE_IMAGE_STEPS',
      'REPLICATE_IMAGE_GUIDANCE_SCALE',
      'GOOGLE_GEMINI_API_KEY',
      'GEMINI_PRODUCTION_POLICY_ACKNOWLEDGED',
      'AI_GLOBAL_DAILY_LIMIT',
    ],
  },
  ops: {
    required: [
      'DATABASE_URL',
      'RELEASE_SHA',
      'AUTH_SECRET',
      'AUTH_URL',
      'NEXT_PUBLIC_WEB_URL',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
    ],
    optional: [
      'OPS_GOOGLE_HOSTED_DOMAIN',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_IMAGE_HOSTS',
    ],
  },
  migration: {
    required: ['DIRECT_URL'],
    optional: [],
  },
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readValue(name) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function validateUrl(name, protocols) {
  const value = readValue(name);
  if (!value) return;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${name} must be a valid URL.`);
  }

  if (!protocols.includes(parsed.protocol)) {
    fail(`${name} must use ${protocols.join(' or ')}.`);
  }
}

function validatePairedValues(first, second) {
  if (Boolean(readValue(first)) !== Boolean(readValue(second))) {
    fail(`${first} and ${second} must either both be set or both be omitted.`);
  }
}

const [app, outputArgument] = process.argv.slice(2);
const config = APP_CONFIG[app];

if (!config || !outputArgument) {
  fail('Usage: node scripts/write-cloudflare-secrets.mjs <web|ops|migration> <output-path|--validate-only>');
}

const missing = config.required.filter((name) => !readValue(name));
if (missing.length > 0) {
  fail(`Missing required ${app} deployment values: ${missing.join(', ')}`);
}

if (app !== 'migration' && !/^[0-9a-f]{40}$/.test(readValue('RELEASE_SHA'))) {
  fail('RELEASE_SHA must be a full lowercase Git commit SHA.');
}

if (app !== 'migration') {
  const authSecretName = app === 'web' ? 'NEXTAUTH_SECRET' : 'AUTH_SECRET';
  if (readValue(authSecretName).length < 32) {
    fail(`${authSecretName} must contain at least 32 characters.`);
  }
}
if (app === 'web' && readValue('CRON_SECRET').length < 32) {
  fail('CRON_SECRET must contain at least 32 characters.');
}

validateUrl(app === 'migration' ? 'DIRECT_URL' : 'DATABASE_URL', ['postgres:', 'postgresql:']);
if (app !== 'migration') {
  validateUrl(app === 'web' ? 'NEXTAUTH_URL' : 'AUTH_URL', ['https:']);
  validateUrl('NEXT_PUBLIC_WEB_URL', ['https:']);
  validateUrl('NEXT_PUBLIC_SUPABASE_URL', ['https:']);
}
if (app === 'web') {
  validateUrl('NEXT_PUBLIC_APP_URL', ['https:']);
  validateUrl('NEXT_PUBLIC_OPS_URL', ['https:']);

  const backupDays = Number.parseInt(readValue('BACKUP_RETENTION_DAYS'), 10);
  if (!Number.isInteger(backupDays) || backupDays < 1 || backupDays > 3_650) {
    fail('BACKUP_RETENTION_DAYS must be an integer between 1 and 3650.');
  }

  const privacyContact = readValue('NEXT_PUBLIC_PRIVACY_CONTACT');
  const emailDomain = privacyContact.split('@').at(-1)?.toLowerCase();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(privacyContact)
    && emailDomain !== 'example.com';
  let isHttpsUrl = false;
  try {
    const url = new URL(privacyContact);
    isHttpsUrl = url.protocol === 'https:' && url.hostname !== 'example.com';
  } catch {
    // An email address may still be valid.
  }
  if (!isEmail && !isHttpsUrl) {
    fail('NEXT_PUBLIC_PRIVACY_CONTACT must be an email address or HTTPS URL.');
  }
}

if (app !== 'migration') {
  validatePairedValues('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET');
}
if (
  app === 'web'
  && readValue('GOOGLE_GEMINI_API_KEY')
  && readValue('GEMINI_PRODUCTION_POLICY_ACKNOWLEDGED') !== 'true'
) {
  fail('GEMINI_PRODUCTION_POLICY_ACKNOWLEDGED must be true when Gemini is enabled.');
}

const bindings = {};
for (const name of [...config.required, ...config.optional]) {
  const value = readValue(name);
  if (value) bindings[name] = value;
}

if (outputArgument === '--validate-only') {
  console.log(`Validated ${app} production configuration.`);
} else {
  if (app === 'migration') {
    fail('Migration configuration can only be used with --validate-only.');
  }

  const outputPath = path.resolve(outputArgument);
  await writeFile(outputPath, `${JSON.stringify(bindings)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });

  console.log(`Prepared ${app} Cloudflare bindings (${Object.keys(bindings).length} values).`);
}
