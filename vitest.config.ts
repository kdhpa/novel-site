import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: '@novelverse/db/browser', replacement: fromRoot('./packages/db/src/browser.ts') },
      { find: '@novelverse/db/client', replacement: fromRoot('./packages/db/src/client.ts') },
      { find: '@novelverse/db/runtime-client-cloudflare', replacement: fromRoot('./packages/db/src/runtime-client-cloudflare.ts') },
      { find: '@novelverse/db/runtime-client', replacement: fromRoot('./packages/db/src/runtime-client.ts') },
      { find: '@novelverse/db', replacement: fromRoot('./packages/db/src/index.ts') },
      { find: '@novelverse/auth', replacement: fromRoot('./packages/auth/src/index.ts') },
      { find: '@novelverse/shared/content-security-policy', replacement: fromRoot('./packages/shared/src/content-security-policy.ts') },
      { find: '@novelverse/shared/proxy', replacement: fromRoot('./packages/shared/src/proxy.ts') },
      { find: '@novelverse/shared', replacement: fromRoot('./packages/shared/src/index.ts') },
      { find: '@', replacement: fromRoot('./apps/web/src') },
    ],
  },
  test: {
    environment: 'node',
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
