import { assertRateLimit } from './rate-limit';

function getGlobalDailyLimit() {
  const configured = Number(process.env.AI_GLOBAL_DAILY_LIMIT);
  return Number.isInteger(configured) && configured > 0 ? configured : 1_000;
}

/** Shared DB-backed circuit breaker for all paid AI provider requests. */
export function assertGlobalAiBudget() {
  return assertRateLimit({
    key: 'ai:global:rolling-day',
    limit: getGlobalDailyLimit(),
    windowMs: 24 * 60 * 60_000,
  });
}
