// NextAuth v5 configuration for NovelVerse

import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import prisma from './prisma';
import { authConfig } from './auth.config';
import type { Role } from '@novelverse/db/client';
import { ApiError } from './server/api';
import { assertRateLimit, getClientIp, resetRateLimit } from './server/rate-limit';
import { normalizedEmailSchema } from './server/validation';
import {
  finalizeVerifiedGoogleAccountLink,
  isCredentialAuthenticationAllowed,
  isSessionInvalidatedByPasswordChange,
  isVerifiedGoogleProfile,
  mapVerifiedGoogleProfile,
  normalizeIdentityEmail,
  buildOAuthNicknameCandidates,
  normalizeNicknameKey,
  logServerError,
} from '@novelverse/shared';

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
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: '이메일', type: 'email' },
        password: { label: '비밀번호', type: 'password' },
      },
      async authorize(credentials, request) {
        const clientIp = getClientIp(request);
        try {
          await assertRateLimit({
            key: `login:ip:${clientIp}`,
            limit: 50,
            windowMs: 15 * 60_000,
          });
        } catch (error) {
          if (error instanceof ApiError && error.status === 429) return null;
          throw error;
        }

        const emailResult = normalizedEmailSchema.safeParse(credentials?.email);
        const rawPassword = typeof credentials?.password === 'string' ? credentials.password : '';
        if (!emailResult.success || !rawPassword) return null;

        const email = emailResult.data;
        const accountLimitKey = `login:account:${email}`;
        try {
          await assertRateLimit({
            key: accountLimitKey,
            limit: 10,
            windowMs: 15 * 60_000,
          });
        } catch (error) {
          if (error instanceof ApiError && error.status === 429) return null;
          throw error;
        }

        const passwordIsWithinLimit = rawPassword.length <= 128;
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

        // 존재하지 않는 계정도 같은 비용의 bcrypt 검증을 거쳐 타이밍 기반 계정 열거를 줄인다.
        const isPasswordValid = await bcrypt.compare(password, user?.password || INVALID_PASSWORD_HASH);

        if (!isCredentialAuthenticationAllowed({
          userExists: Boolean(user),
          hasPassword: Boolean(user?.password),
          emailVerified: Boolean(user?.emailVerified),
          accountActive: !user?.suspendedAt,
          passwordWithinLimit: passwordIsWithinLimit,
          passwordValid: isPasswordValid,
        })) {
          return null;
        }
        if (!user) return null;

        // 계정별 실패 누적만 해제한다. IP 제한은 성공 요청으로 우회 세탁되지 않게 유지한다.
        await resetRateLimit(accountLimitKey);

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
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return true;
      if (!isVerifiedGoogleProfile(profile)) return false;
      const trustedEmail = normalizeIdentityEmail(profile.email);
      const [existingUser, linkedAccount] = await Promise.all([
        prisma.user.findUnique({
          where: { emailNormalized: trustedEmail },
          select: { id: true, suspendedAt: true },
        }),
        prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            },
          },
          select: {
            userId: true,
            user: { select: { id: true, suspendedAt: true } },
          },
        }),
      ]);
      if (linkedAccount && existingUser && linkedAccount.userId !== existingUser.id) return false;
      const targetUser = linkedAccount?.user ?? existingUser;
      if (targetUser?.suspendedAt) return false;

      // Auth.js issues the JWT before events.signIn. Securing an existing target here
      // keeps the freshly issued Google JWT newer than passwordChangedAt.
      if (targetUser) {
        await prisma.$transaction((transaction) =>
          finalizeVerifiedGoogleAccountLink(transaction, targetUser.id, trustedEmail)
        );
      }
      return true;
    },
    async jwt({ token, user }) {
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
            if (currentUser.suspendedAt) return null;
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
      if (account?.provider === 'google' && isVerifiedGoogleProfile(profile)) {
        await prisma.$transaction((transaction) =>
          finalizeVerifiedGoogleAccountLink(transaction, user.id, profile.email)
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
          logServerError('auth.oauth-nickname', error, { userId: user.id });
          return;
        }
      }
    },
  },
});

// Helper function to hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// Helper function to verify password
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

// Helper function to get current user from session
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
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

  return user;
}

// Helper to check if user is authenticated
export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error('로그인이 필요합니다.');
  }
  return session.user;
}

// Helper to check if user is admin
export async function requireAdmin() {
  const user = await requireAuth();
  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (currentUser?.role !== 'ADMIN') {
    throw new Error('관리자 권한이 필요합니다.');
  }
  return { ...user, role: currentUser.role };
}
