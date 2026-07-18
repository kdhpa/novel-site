import { randomUUID } from 'node:crypto';
import { expect, test, type APIResponse, type Page } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';

const WEB_URL = 'http://127.0.0.1:3000';
const OPS_URL = 'http://127.0.0.1:3002';
const PASSWORD = 'NovelVerse-e2e-password-123!';
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const authorEmail = `e2e-author-${runId}@novelverse.test`;
const adminEmail = `e2e-admin-${runId}@novelverse.test`;
const authorId = `e2e-author-${randomUUID()}`;
const adminId = `e2e-admin-${randomUUID()}`;
const novelTitle = `E2E 공개 작품 ${runId}`;
const chapterTitle = '첫 번째 회차';
const chapterText = '독자가 읽게 될 첫 문장입니다.';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function expectApiData<T>(response: APIResponse): Promise<T> {
  const payload = await response.json() as ApiEnvelope<T>;
  expect(response.ok(), payload.error || `API 요청 실패 (${response.status()})`).toBeTruthy();
  expect(payload.success, payload.error).toBe(true);
  expect(payload.data).toBeDefined();
  return payload.data as T;
}

async function logIn(page: Page, origin: string, email: string, callbackPath: string) {
  await page.goto(`${origin}/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
  const loginButton = page
    .getByRole('main')
    .getByRole('button', { name: '로그인', exact: true });
  await expect(loginButton).toBeEnabled();

  const emailInput = page.getByLabel('이메일');
  const passwordInput = page.getByLabel('비밀번호');
  await emailInput.fill(email);
  await passwordInput.fill(PASSWORD);
  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue(PASSWORD);

  await loginButton.click();
  await page.waitForURL((url) => url.origin === origin && url.pathname === callbackPath);
}

test.describe('작가 작성부터 운영 심사와 독자 공개까지', () => {
  let novelId: string | undefined;
  let chapterId: string | undefined;

  test.beforeAll(async () => {
    // E2E는 외부 메일 전달을 테스트하지 않는다. 실제 로그인 정책은 그대로 거치도록
    // 이메일 인증이 완료된 최소 계정만 전용 테스트 DB에 준비한다.
    const password = await bcrypt.hash(PASSWORD, 10);
    const emailVerified = new Date();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users
          (id, email, password, "emailVerified", name, nickname, role,
           "isVerifiedAuthor", "verifiedAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'AUTHOR', true, $4, NOW(), NOW())`,
        [
          authorId,
          authorEmail,
          password,
          emailVerified,
          'E2E 작가',
          `e2e-author-${runId}`.slice(0, 40),
        ],
      );
      await client.query(
        `INSERT INTO users
          (id, email, password, "emailVerified", name, nickname, role,
           "isVerifiedAuthor", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'ADMIN', false, NOW(), NOW())`,
        [
          adminId,
          adminEmail,
          password,
          emailVerified,
          'E2E 운영자',
          `e2e-admin-${runId}`.slice(0, 40),
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test.afterAll(async () => {
    try {
      await pool.query(
        `DELETE FROM content_views
         WHERE "targetId" IN (
           SELECT id FROM novels WHERE "authorId" = $1
           UNION
           SELECT chapters.id
           FROM chapters
           INNER JOIN novels ON novels.id = chapters."novelId"
           WHERE novels."authorId" = $1
         )`,
        [authorId],
      );
      await pool.query(
        `DELETE FROM admin_audit_logs
         WHERE "adminId" = $1 OR ("targetType" = 'novel' AND "targetId" = $2)`,
        [adminId, novelId ?? null],
      );
      await pool.query('DELETE FROM novels WHERE "authorId" = $1', [authorId]);

      const rateLimitKeys = [
        `login:account:${authorEmail}`,
        `ops-login:account:${adminEmail}`,
        `content:novel-write:${authorId}`,
        `content:chapter-write:${authorId}`,
        `review:submit:${authorId}`,
      ];
      await pool.query('DELETE FROM rate_limit_buckets WHERE key = ANY($1::text[])', [rateLimitKeys]);
      await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [[authorEmail, adminEmail]]);
    } finally {
      await pool.end();
    }
  });

  test('인증된 작가의 작품을 운영자가 본문 확인 후 승인하면 독자가 읽을 수 있다', async ({ browser }) => {
    test.setTimeout(90_000);

    const authorContext = await browser.newContext({ baseURL: WEB_URL });
    const adminContext = await browser.newContext({ baseURL: OPS_URL });
    const readerContext = await browser.newContext({ baseURL: WEB_URL });

    try {
      const authorPage = await authorContext.newPage();
      await logIn(authorPage, WEB_URL, authorEmail, '/');

      const novelResponse = await authorPage.request.post('/api/novels', {
        data: {
          title: novelTitle,
          description: '운영 심사와 공개 경로를 검증하기 위한 작품 소개입니다.',
          genres: ['FANTASY'],
          status: 'ONGOING',
          tags: [],
        },
      });
      const novel = await expectApiData<{ id: string }>(novelResponse);
      novelId = novel.id;

      const chapterResponse = await authorPage.request.post(`/api/novels/${novelId}/chapters`, {
        data: {
          title: chapterTitle,
          chapterNumber: 1,
          content: `<p>${chapterText}</p>`,
          isPublished: false,
        },
      });
      const chapter = await expectApiData<{ id: string }>(chapterResponse);
      chapterId = chapter.id;

      const reviewResponse = await authorPage.request.post(`/api/novels/${novelId}/submit-review`);
      const submittedNovel = await expectApiData<{ approvalStatus: string }>(reviewResponse);
      expect(submittedNovel.approvalStatus).toBe('PENDING_REVIEW');

      const adminPage = await adminContext.newPage();
      await logIn(adminPage, OPS_URL, adminEmail, '/reviews');

      const reviewCard = adminPage.locator('article', { hasText: novelTitle });
      await expect(reviewCard).toBeVisible();
      await reviewCard.getByRole('link', { name: '본문 검토 후 심사' }).click();
      await expect(adminPage).toHaveURL(`${OPS_URL}/reviews/${novelId}`);
      await expect(adminPage.getByRole('heading', { name: novelTitle })).toBeVisible();

      await adminPage.getByRole('link', { name: '전체 본문 열기' }).click();
      await expect(adminPage).toHaveURL(`${OPS_URL}/reviews/${novelId}/chapters/${chapterId}`);
      await expect(adminPage.getByRole('heading', { level: 1 })).toContainText(chapterTitle);
      await expect(adminPage.getByText(chapterText, { exact: true })).toBeVisible();
      await adminPage.getByRole('link', { name: '작품 심사로' }).click();

      const reviewCheckbox = adminPage.getByRole('checkbox', {
        name: '모든 회차의 본문과 작품 정보를 직접 검토했습니다.',
      });
      const approveButton = adminPage.getByRole('button', { name: '승인', exact: true });
      await expect(approveButton).toBeDisabled();
      await reviewCheckbox.check();
      await expect(approveButton).toBeEnabled();

      adminPage.once('dialog', (dialog) => dialog.accept());
      const [approveResponse] = await Promise.all([
        adminPage.waitForResponse((response) =>
          response.request().method() === 'POST'
          && response.url().endsWith(`/api/ops/reviews/${novelId}/approve`)),
        approveButton.click(),
      ]);
      expect(approveResponse.ok()).toBeTruthy();
      expect(approveResponse.request().postDataJSON()).toEqual({ reviewConfirmed: true });
      const approvePayload = await approveResponse.json() as ApiEnvelope<unknown>;
      expect(approvePayload.success, approvePayload.error).toBe(true);

      const readerPage = await readerContext.newPage();
      await readerPage.goto(`${WEB_URL}/novels/${novelId}`);
      await expect(readerPage.getByRole('heading', { name: novelTitle })).toBeVisible();
      await readerPage.getByRole('link', { name: '첫 화 보기', exact: true }).click();
      await readerPage.waitForURL(`${WEB_URL}/novels/${novelId}/${chapterId}`);
      await expect(readerPage.getByRole('heading', { level: 1, name: chapterTitle })).toBeVisible();
      await expect(
        readerPage.locator('article.reader-content').getByText(chapterText, { exact: true }),
      ).toBeVisible();

      await authorPage.goto(`${WEB_URL}/novels/${novelId}`);
      await authorPage.getByRole('button', { name: '북마크 추가' }).click();
      await expect(authorPage.getByRole('button', { name: '북마크 해제' })).toBeVisible();
      await authorPage.getByRole('button', { name: '좋아요', exact: true }).click();
      await expect(authorPage.getByRole('button', { name: '좋아요 취소' })).toBeVisible();
    } finally {
      await Promise.all([
        authorContext.close(),
        adminContext.close(),
        readerContext.close(),
      ]);
    }
  });
});
