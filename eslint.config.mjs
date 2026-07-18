import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: {
        rootDir: ['apps/web', 'apps/ops'],
      },
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "apps/**/.next/**",
    "apps/**/.open-next/**",
    "apps/**/.wrangler/**",
    "apps/**/cloudflare-env.d.ts",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "packages/**/src/generated/prisma/**",
    "packages/**/src/generated/prisma-cloudflare/**",
  ]),
]);

export default eslintConfig;
