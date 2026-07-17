import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '@novelverse/db/client';
import { normalizeEmailAddress } from './validation';

export const AUTH_TOKEN_TTL_MS = {
  emailVerification: 24 * 60 * 60_000,
  passwordReset: 30 * 60_000,
  accountDeletion: 10 * 60_000,
  accountExport: 10 * 60_000,
} as const;

export type AuthTokenPurpose = keyof typeof AUTH_TOKEN_TTL_MS;

type TokenClient = Pick<Prisma.TransactionClient, 'verificationToken'>;

export function authTokenIdentifier(purpose: AuthTokenPurpose, email: string) {
  const prefix = purpose === 'emailVerification'
    ? 'email-verification'
    : purpose === 'passwordReset'
      ? 'password-reset'
      : purpose === 'accountDeletion'
        ? 'account-deletion'
        : 'account-export';
  return `${prefix}:${normalizeEmailAddress(email)}`;
}

export function hashAuthToken(rawToken: string) {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function createAuthToken(
  purpose: AuthTokenPurpose,
  email: string,
  now = new Date(),
) {
  const rawToken = randomBytes(32).toString('base64url');
  return {
    rawToken,
    identifier: authTokenIdentifier(purpose, email),
    tokenHash: hashAuthToken(rawToken),
    expires: new Date(now.getTime() + AUTH_TOKEN_TTL_MS[purpose]),
  };
}

export async function storeAuthToken(
  client: TokenClient,
  token: ReturnType<typeof createAuthToken>,
) {
  await client.verificationToken.deleteMany({
    where: { identifier: token.identifier },
  });
  await client.verificationToken.create({
    data: {
      identifier: token.identifier,
      token: token.tokenHash,
      expires: token.expires,
    },
  });
}

export async function consumeAuthToken(
  client: TokenClient,
  purpose: AuthTokenPurpose,
  email: string,
  rawToken: string,
  now = new Date(),
) {
  const result = await client.verificationToken.deleteMany({
    where: {
      identifier: authTokenIdentifier(purpose, email),
      token: hashAuthToken(rawToken),
      expires: { gt: now },
    },
  });

  return result.count === 1;
}
