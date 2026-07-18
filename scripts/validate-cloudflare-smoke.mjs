#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [check, inputPath, expectedRelease] = process.argv.slice(2);
if (!['ops-providers', 'ops-health', 'web-health'].includes(check) || !inputPath) {
  fail('Usage: node scripts/validate-cloudflare-smoke.mjs <ops-providers|ops-health|web-health> <json-path> [expected-release-sha]');
}
if (check.endsWith('health') && !/^[0-9a-f]{40}$/.test(expectedRelease || '')) {
  fail('Health checks require the expected full lowercase Git commit SHA.');
}

let response;
try {
  const body = (await readFile(inputPath, 'utf8')).replace(/^\uFEFF/, '');
  response = JSON.parse(body);
} catch {
  fail(`The ${check} endpoint did not return valid JSON.`);
}

if (check === 'ops-providers') {
  if (!response?.google || response.google.type !== 'oidc') {
    fail('Ops smoke test failed: the Google SSO provider is missing.');
  }
  if (response.credentials) {
    fail('Ops smoke test failed: password login is enabled in production.');
  }
  console.log('Ops Google-only provider policy is active.');
} else if (check === 'ops-health') {
  if (response?.status !== 'ok' || response?.release !== expectedRelease) {
    fail('Ops smoke test failed: the database is not ready or the release SHA is stale.');
  }
  console.log('Ops health is ok; the database is up.');
} else {
  if (
    response?.status !== 'ok'
    || response?.release !== expectedRelease
    || response?.checks?.database?.status !== 'up'
    || response?.checks?.storage?.status !== 'up'
  ) {
    fail('Web smoke test failed: health, database, or persistent storage is not ready.');
  }
  console.log('Web health is ok; database and persistent storage are up.');
}
