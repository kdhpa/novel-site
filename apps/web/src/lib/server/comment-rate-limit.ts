import { assertRateLimit } from './rate-limit';

export async function assertCommentMutationRateLimit(userId: string) {
  await assertRateLimit({
    key: `comments:mutation:minute:${userId}`,
    limit: 10,
    windowMs: 60_000,
  });
  await assertRateLimit({
    key: `comments:mutation:day:${userId}`,
    limit: 100,
    windowMs: 24 * 60 * 60_000,
  });
}
