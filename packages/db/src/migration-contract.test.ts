import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));
const bootstrapAdminScript = readFileSync(
  fileURLToPath(new URL('../scripts/bootstrap-admin.mjs', import.meta.url)),
  'utf8',
);

function migrationSqlFiles() {
  return readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      sql: readFileSync(
        fileURLToPath(new URL(`../prisma/migrations/${entry.name}/migration.sql`, import.meta.url)),
        'utf8',
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

describe('database migration contracts', () => {
  it('keeps every runtime image storage provider allowed by the latest constraint', () => {
    const latestStorageConstraint = migrationSqlFiles()
      .filter(({ sql }) => sql.includes('ADD CONSTRAINT "image_jobs_storage_provider"'))
      .at(-1);

    expect(latestStorageConstraint).toBeDefined();
    expect(latestStorageConstraint?.sql).toContain("'supabase-s3'");
    expect(latestStorageConstraint?.sql).toContain("'source-tree'");
    expect(latestStorageConstraint?.sql).toContain("'job_expired'");
    expect(latestStorageConstraint?.sql).toContain('"finalizationAttempts" >= 5');
    expect(latestStorageConstraint?.sql).not.toContain('"tokenExpiresAt" > CURRENT_TIMESTAMP');
  });

  it('stores review exemption as opt-in and restricts it to authors', () => {
    const reviewExemptionMigration = migrationSqlFiles()
      .filter(({ sql }) => sql.includes('ADD COLUMN "canSkipReview"'))
      .at(-1);

    expect(reviewExemptionMigration).toBeDefined();
    expect(reviewExemptionMigration?.sql).toContain(
      'ADD COLUMN "canSkipReview" BOOLEAN NOT NULL DEFAULT false',
    );
    expect(reviewExemptionMigration?.sql).toContain(
      'CHECK (NOT "canSkipReview" OR "role" = \'AUTHOR\')',
    );
    expect(reviewExemptionMigration?.sql).toContain(
      'VALIDATE CONSTRAINT "users_can_skip_review_author"',
    );
  });

  it('clears review exemption when bootstrap promotes an author to admin', () => {
    expect(bootstrapAdminScript).toContain('UPDATE "users" SET "role"');
    expect(bootstrapAdminScript).toContain('"canSkipReview" = false, "updatedAt"');
    expect(bootstrapAdminScript).toContain('previousCanSkipReview: user.canSkipReview');
    expect(bootstrapAdminScript).toContain('nextCanSkipReview: false');
  });
});
