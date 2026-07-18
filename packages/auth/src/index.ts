import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { prisma } from '@novelverse/db';
import { authConfig } from './auth.config';
import type { Role } from '@novelverse/db/browser';
import {
  consumeAuthRateLimit,
  getAuthClientIp,
  normalizeAuthEmail,
  resetAuthRateLimit,
} from './security';
import {
  finalizeVerifiedGoogleAccountLink,
  isCredentialAuthenticationAllowed,
  isSessionInvalidatedByPasswordChange,
  mapVerifiedGoogleProfile,
  normalizeIdentityEmail,
  buildOAuthNicknameCandidates,
  normalizeNicknameKey,
  logServerError,
} from '@novelverse/shared';
import {
  isAllowedOpsAdminAccount,
  isAllowedOpsGoogleProfile,
  isOpsPasswordLoginEnabled,
} from './provider-policy';

export { authConfig };

const INVALID_PASSWORD_HASH = '$2b$12$L9ZCEutoKtpWCZEqZlh4yO4QQdzVoEq9YE8QSYHgvpygz0PwEa0ea';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
            profile: mapVerifiedGoogleProfile,
          }),
        ]
      : []),
    ...(isOpsPasswordLoginEnabled()
      ? [Credentials({
        name: 'credentials',
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(credentials, request) {
        const clientIp = getAuthClientIp(request);
        if (!(await consumeAuthRateLimit(`ops-login:ip:${clientIp}`, 30, 15 * 60_000))) {
          return null;
        }

        const email = normalizeAuthEmail(credentials?.email);
        const rawPassword = typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || email.length > 255 || !rawPassword) return null;

        const accountKey = `ops-login:account:${email}`;
        if (!(await consumeAuthRateLimit(accountKey, 8, 15 * 60_000))) return null;

        const passwordWithinLimit = rawPassword.length <= 128;
        const password = rawPassword.slice(0, 128);

        const user = await prisma.user.findUnique({
          where: { emailNormalized: email },
          select: {
            id: true,
            email: true,
            password: true,
            name: true,
            nickname: true,
            image: true,
            role: true,
            isVerifiedAuthor: true,
            emailVerified: true,
            suspendedAt: true,
          },
        });

        const isPasswordValid = await bcrypt.compare(password, user?.password || INVALID_PASSWORD_HASH);

        if (!isCredentialAuthenticationAllowed({
          userExists: Boolean(user),
          hasPassword: Boolean(user?.password),
          emailVerified: Boolean(user?.emailVerified),
          accountActive: !user?.suspendedAt,
          passwordWithinLimit,
          passwordValid: isPasswordValid,
        })) {
          return null;
        }
        if (!user || !isAllowedOpsAdminAccount(user)) return null;

        await resetAuthRateLimit(accountKey);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          nickname: user.nickname,
          image: user.image,
          role: user.role,
          isVerifiedAuthor: user.isVerifiedAuthor,
        };
        },
      })]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return true;
      if (!isAllowedOpsGoogleProfile(profile)) return false;
      const trustedEmail = normalizeIdentityEmail((profile as { email: string }).email);
      const [existingUser, linkedAccount] = await Promise.all([
        prisma.user.findUnique({
          where: { emailNormalized: trustedEmail },
          select: { id: true, role: true, suspendedAt: true },
        }),
        prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            },
          },
          select: { userId: true },
        }),
      ]);
      if (!existingUser || !isAllowedOpsAdminAccount(existingUser)) return false;
      if (linkedAccount && linkedAccount.userId !== existingUser.id) return false;

      // Auth.js invokes callbacks.jwt before events.signIn, so invalidate a claimed
      // password before the new Google JWT is timestamped.
      await prisma.$transaction((transaction) =>
        finalizeVerifiedGoogleAccountLink(transaction, existingUser.id, trustedEmail)
      );
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.sessionIssuedAt = Date.now();
        token.id = user.id;
        token.email = user.email!;
        token.name = user.name;
        token.nickname = (user as { nickname?: string }).nickname;
        token.image = user.image;
        token.role = (user as { role: Role }).role;
        token.isVerifiedAuthor = (user as { isVerifiedAuthor?: boolean }).isVerifiedAuthor || false;
      }

      if (trigger === 'update' && session) {
        token.name = session.name;
        token.nickname = session.nickname;
        token.image = session.image;
      }

      if (token.id) {
        try {
          const currentUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              email: true,
              name: true,
              nickname: true,
              image: true,
              role: true,
              isVerifiedAuthor: true,
              passwordChangedAt: true,
              suspendedAt: true,
            },
          });
          if (currentUser) {
            if (!isAllowedOpsAdminAccount(currentUser)) return null;
            if (isSessionInvalidatedByPasswordChange(
              token.sessionIssuedAt,
              currentUser.passwordChangedAt,
            )) {
              return null;
            }
            token.email = currentUser.email;
            token.name = currentUser.name;
            token.nickname = currentUser.nickname;
            token.image = currentUser.image;
            token.role = currentUser.role;
            token.isVerifiedAuthor = currentUser.isVerifiedAuthor;
          } else {
            return null;
          }
        } catch {
          return null;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name;
        session.user.nickname = token.nickname as string | null;
        session.user.image = token.image as string | null;
        session.user.role = token.role as Role;
        session.user.isVerifiedAuthor = token.isVerifiedAuthor as boolean;
      }
      return session;
    },
  },
  events: {
    async linkAccount({ user, account }) {
      const email = user.email;
      if (account.provider === 'google' && email) {
        await prisma.$transaction((transaction) =>
          finalizeVerifiedGoogleAccountLink(transaction, user.id, email)
        );
      }
    },
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google' && isAllowedOpsGoogleProfile(profile)) {
        const trustedProfile = mapVerifiedGoogleProfile(profile);
        await prisma.$transaction((transaction) =>
          finalizeVerifiedGoogleAccountLink(transaction, user.id, trustedProfile.email)
        );
      }
    },
    async createUser({ user }) {
      if (!user.email || (user as { nickname?: string | null }).nickname) return;
      const candidates = buildOAuthNicknameCandidates({
        name: user.name,
        email: user.email,
        userId: user.id,
      });

      for (const nickname of candidates) {
        try {
          const updated = await prisma.user.updateMany({
            where: { id: user.id, nickname: null },
            data: { nickname, nicknameNormalized: normalizeNicknameKey(nickname) },
          });
          if (updated.count === 1 || updated.count === 0) return;
        } catch (error) {
          if ((error as { code?: string } | null)?.code === 'P2002') continue;
          logServerError('ops-auth.oauth-nickname', error, { userId: user.id });
          return;
        }
      }
    },
  },
});

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      nickname: true,
      image: true,
      bio: true,
      role: true,
      createdAt: true,
    },
  });
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  return session.user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  if (currentUser?.role !== 'ADMIN') {
    throw new Error('Admin access required');
  }
  return { ...user, role: currentUser.role };
}
