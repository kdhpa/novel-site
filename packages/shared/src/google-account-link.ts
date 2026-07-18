import type { Prisma } from '@novelverse/db/client';
import { normalizeIdentityEmail } from './identity';

type GoogleAccountLinkClient = Pick<
  Prisma.TransactionClient,
  'user' | 'session' | 'verificationToken'
>;

export async function finalizeVerifiedGoogleAccountLink(
  client: GoogleAccountLinkClient,
  userId: string,
  verifiedEmail: string,
  now = new Date(),
) {
  const email = normalizeIdentityEmail(verifiedEmail);
  const claimedAccount = await client.user.updateMany({
    where: {
      id: userId,
      emailVerified: null,
      password: { not: null },
    },
    data: {
      email,
      emailNormalized: email,
      emailVerified: now,
      password: null,
      passwordChangedAt: now,
    },
  });

  if (claimedAccount.count === 1) {
    await client.session.deleteMany({ where: { userId } });
    await client.verificationToken.deleteMany({
      where: {
        identifier: {
          in: [
            `email-verification:${email}`,
            `password-reset:${email}`,
            `account-deletion:${email}`,
            `account-export:${email}`,
          ],
        },
      },
    });
    return { passwordInvalidated: true } as const;
  }

  await client.user.update({
    where: { id: userId },
    data: {
      email,
      emailNormalized: email,
      emailVerified: now,
    },
    select: { id: true },
  });
  return { passwordInvalidated: false } as const;
}
