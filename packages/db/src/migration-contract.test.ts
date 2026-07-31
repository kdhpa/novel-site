import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));

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
});
