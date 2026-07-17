import { absoluteUrl, getSiteUrl } from '@/lib/site';
import { hashAuthToken } from './auth-tokens';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 10_000;
type AuthEmailEnvironment = Readonly<Record<string, string | undefined>>;

export class AuthEmailConfigurationError extends Error {
  constructor(message = '이메일 발송 설정이 완료되지 않았습니다.') {
    super(message);
    this.name = 'AuthEmailConfigurationError';
  }
}

export class AuthEmailDeliveryError extends Error {
  constructor(message = '인증 이메일을 발송하지 못했습니다.') {
    super(message);
    this.name = 'AuthEmailDeliveryError';
  }
}

export function isAuthEmailConfigured(env: AuthEmailEnvironment = process.env) {
  return Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim());
}

export function isAuthEmailDeliveryEnabled(env: AuthEmailEnvironment = process.env) {
  return env.NODE_ENV !== 'production' || isAuthEmailConfigured(env);
}

export function isCredentialsRegistrationEnabled(env: AuthEmailEnvironment = process.env) {
  return isAuthEmailDeliveryEnabled(env);
}

function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new AuthEmailConfigurationError();

  const configuredTimeout = Number(process.env.AUTH_EMAIL_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(configuredTimeout)
    ? Math.min(Math.max(configuredTimeout, 1_000), 30_000)
    : DEFAULT_TIMEOUT_MS;

  const siteUrl = getSiteUrl();
  if (process.env.NODE_ENV === 'production' && siteUrl.protocol !== 'https:') {
    throw new AuthEmailConfigurationError('운영 이메일 링크에는 HTTPS 서비스 URL이 필요합니다.');
  }

  return { apiKey, from, timeoutMs };
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function sendAuthEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}) {
  const config = getEmailConfig();
  let response: Response;

  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch {
    throw new AuthEmailDeliveryError();
  }

  if (!response.ok) {
    throw new AuthEmailDeliveryError(`이메일 공급자가 요청을 거부했습니다. (${response.status})`);
  }
}

export function buildEmailVerificationUrl(email: string, rawToken: string) {
  const url = new URL(absoluteUrl('/verify-email'));
  url.searchParams.set('email', email);
  url.searchParams.set('token', rawToken);
  return url.toString();
}

export function buildPasswordResetUrl(email: string, rawToken: string) {
  const url = new URL(absoluteUrl('/reset-password'));
  url.searchParams.set('email', email);
  url.searchParams.set('token', rawToken);
  return url.toString();
}

export function buildAccountDeletionUrl(rawToken: string) {
  const url = new URL(absoluteUrl('/settings'));
  url.searchParams.set('deleteToken', rawToken);
  return url.toString();
}

export function buildAccountExportUrl(rawToken: string) {
  const url = new URL(absoluteUrl('/settings'));
  url.searchParams.set('exportToken', rawToken);
  return url.toString();
}

export async function sendEmailVerification(email: string, rawToken: string) {
  const link = buildEmailVerificationUrl(email, rawToken);
  await sendAuthEmail({
    to: email,
    subject: '[NovelVerse] 이메일 주소를 인증해 주세요',
    text: `아래 링크에서 이메일 인증을 완료해 주세요.\n\n${link}\n\n이 링크는 24시간 동안 유효합니다.`,
    html: `<p>NovelVerse 가입을 완료하려면 이메일 주소를 인증해 주세요.</p><p><a href="${escapeHtml(link)}">이메일 인증하기</a></p><p>이 링크는 24시간 동안 유효합니다.</p>`,
    idempotencyKey: `verify-${hashAuthToken(rawToken)}`,
  });
}

export async function sendPasswordReset(email: string, rawToken: string) {
  const link = buildPasswordResetUrl(email, rawToken);
  await sendAuthEmail({
    to: email,
    subject: '[NovelVerse] 비밀번호 재설정 안내',
    text: `아래 링크에서 비밀번호를 재설정해 주세요.\n\n${link}\n\n이 링크는 30분 동안 유효합니다.`,
    html: `<p>요청하신 비밀번호 재설정 링크입니다.</p><p><a href="${escapeHtml(link)}">비밀번호 재설정하기</a></p><p>이 링크는 30분 동안 유효합니다.</p>`,
    idempotencyKey: `password-reset-${hashAuthToken(rawToken)}`,
  });
}

export async function sendAccountDeletionConfirmation(email: string, rawToken: string) {
  const link = buildAccountDeletionUrl(rawToken);
  await sendAuthEmail({
    to: email,
    subject: '[NovelVerse] 계정 삭제를 확인해 주세요',
    text: `아래 링크에서 계정 삭제를 확인해 주세요.\n\n${link}\n\n이 링크는 10분 동안 한 번만 사용할 수 있습니다. 본인이 요청하지 않았다면 이 메일을 무시해 주세요.`,
    html: `<p>NovelVerse 계정 삭제 확인 요청입니다.</p><p><a href="${escapeHtml(link)}">계정 삭제 확인하기</a></p><p>이 링크는 10분 동안 한 번만 사용할 수 있습니다. 본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>`,
    idempotencyKey: `account-deletion-${hashAuthToken(rawToken)}`,
  });
}

export async function sendAccountExportConfirmation(email: string, rawToken: string) {
  const link = buildAccountExportUrl(rawToken);
  await sendAuthEmail({
    to: email,
    subject: '[NovelVerse] 데이터 내보내기를 확인해 주세요',
    text: `아래 링크에서 데이터 내보내기를 확인해 주세요.\n\n${link}\n\n이 링크는 10분 동안 한 번만 사용할 수 있습니다. 본인이 요청하지 않았다면 이 메일을 무시해 주세요.`,
    html: `<p>NovelVerse 데이터 내보내기 확인 요청입니다.</p><p><a href="${escapeHtml(link)}">데이터 내보내기 확인하기</a></p><p>이 링크는 10분 동안 한 번만 사용할 수 있습니다. 본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>`,
    idempotencyKey: `account-export-${hashAuthToken(rawToken)}`,
  });
}
