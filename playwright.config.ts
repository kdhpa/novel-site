import { defineConfig, devices } from '@playwright/test';

const WEB_URL = 'http://127.0.0.1:3000';
const OPS_URL = 'http://127.0.0.1:3002';

function requireSafeE2eDatabaseUrl() {
  const value = process.env.E2E_DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      'E2E_DATABASE_URL이 필요합니다. 실제 서비스 DB가 아닌 전용 테스트 PostgreSQL URL을 지정하세요.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('E2E_DATABASE_URL이 올바른 PostgreSQL URL이 아닙니다.');
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('E2E_DATABASE_URL은 PostgreSQL URL이어야 합니다.');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, '')).toLowerCase();
  if (!/(?:^|[_-])(test|e2e|ci)(?:[_-]|$)/i.test(databaseName)) {
    throw new Error('E2E 데이터베이스 이름에는 test, e2e 또는 ci 표식이 있어야 합니다.');
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!localHosts.has(parsed.hostname) && process.env.E2E_ALLOW_REMOTE_DATABASE !== 'true') {
    throw new Error(
      '원격 E2E DB는 기본적으로 차단됩니다. 전용 테스트 DB임을 확인한 뒤 E2E_ALLOW_REMOTE_DATABASE=true를 명시하세요.',
    );
  }

  return value;
}

const e2eDatabaseUrl = requireSafeE2eDatabaseUrl();

// Config is loaded before Playwright workers are spawned. Overriding these here keeps
// both test code and both Next.js servers away from a developer's normal DATABASE_URL.
process.env.DATABASE_URL = e2eDatabaseUrl;
process.env.DIRECT_URL = e2eDatabaseUrl;

const commonServerEnv = {
  DATABASE_URL: e2eDatabaseUrl,
  DIRECT_URL: e2eDatabaseUrl,
  NEXT_PUBLIC_APP_URL: WEB_URL,
  NEXT_PUBLIC_WEB_URL: WEB_URL,
  NEXT_PUBLIC_OPS_URL: OPS_URL,
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  RESEND_API_KEY: '',
  EMAIL_FROM: '',
  OPS_ALLOW_PASSWORD_LOGIN: 'true',
  TRUSTED_PROXY_PROVIDER: 'none',
  REQUIRE_PERSISTENT_STORAGE: 'false',
  ALLOW_EPHEMERAL_STORAGE: 'true',
};

const webServerEnv = {
  ...commonServerEnv,
  NEXTAUTH_SECRET: 'novelverse-e2e-web-secret-at-least-32-characters',
  AUTH_SECRET: 'novelverse-e2e-web-secret-at-least-32-characters',
  NEXTAUTH_URL: WEB_URL,
  AUTH_URL: WEB_URL,
};

const opsServerEnv = {
  ...commonServerEnv,
  NEXTAUTH_SECRET: 'novelverse-e2e-ops-secret-at-least-32-characters',
  AUTH_SECRET: 'novelverse-e2e-ops-secret-at-least-32-characters',
  NEXTAUTH_URL: OPS_URL,
  AUTH_URL: OPS_URL,
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:web',
      url: WEB_URL,
      env: webServerEnv,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'npm run dev:ops',
      url: OPS_URL,
      env: opsServerEnv,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
