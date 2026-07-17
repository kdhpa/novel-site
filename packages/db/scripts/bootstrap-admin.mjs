import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

function foldAsciiCase(value) {
  return value.replace(/[A-Z]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) + 32));
}

function normalizeBootstrapEmail(value) {
  const email = foldAsciiCase(String(value || '').normalize('NFKC').trim());
  if (email.length < 3 || email.length > 255 || !email.includes('@')) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL에 올바른 이메일을 입력해야 합니다.');
  }
  return email;
}

async function main() {
  const email = normalizeBootstrapEmail(process.env.BOOTSTRAP_ADMIN_EMAIL);
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DIRECT_URL 또는 DATABASE_URL이 필요합니다.');

  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext('novelverse:admin-role-change'))");

    const existingAdmin = await client.query(
      'SELECT "id" FROM "users" WHERE "role" = \'ADMIN\'::"Role" LIMIT 1',
    );
    if (existingAdmin.rowCount > 0) {
      throw new Error('이미 ADMIN 사용자가 있어 bootstrap을 실행할 수 없습니다.');
    }

    const candidates = await client.query(
      'SELECT "id", "email", "emailVerified", "role", "suspendedAt" FROM "users" WHERE "emailNormalized" = $1 LIMIT 2',
      [email],
    );
    if (candidates.rowCount !== 1) {
      throw new Error('승격할 사용자를 정확히 한 명 찾을 수 없습니다.');
    }

    const user = candidates.rows[0];
    if (!user.emailVerified) {
      throw new Error('이메일 인증을 완료한 사용자만 최초 관리자로 승격할 수 있습니다.');
    }
    if (user.suspendedAt) {
      throw new Error('정지되지 않은 사용자만 최초 관리자로 승격할 수 있습니다.');
    }

    await client.query(
      'UPDATE "users" SET "role" = \'ADMIN\'::"Role", "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1',
      [user.id],
    );
    await client.query(
      `INSERT INTO "admin_audit_logs"
        ("id", "adminId", "action", "targetType", "targetId", "message", "metadata", "createdAt")
       VALUES ($1, $2, 'user.role.update', 'user', $2, $3, $4::jsonb, CURRENT_TIMESTAMP)`,
      [
        crypto.randomUUID(),
        user.id,
        '최초 관리자 bootstrap으로 사용자를 ADMIN으로 승격했습니다.',
        JSON.stringify({ source: 'BOOTSTRAP_ADMIN_EMAIL', previousRole: user.role, nextRole: 'ADMIN' }),
      ],
    );

    await client.query('COMMIT');
    transactionOpen = false;
    console.log(`최초 관리자 bootstrap 완료: ${user.email}`);
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '관리자 bootstrap에 실패했습니다.');
  process.exitCode = 1;
});
