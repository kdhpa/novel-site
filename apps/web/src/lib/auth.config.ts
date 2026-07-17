import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { isVerifiedGoogleProfile, mapVerifiedGoogleProfile } from '@novelverse/shared';

export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          allowDangerousEmailAccountLinking: true,
          profile: mapVerifiedGoogleProfile,
        })]
      : []),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: '이메일', type: 'email' },
        password: { label: '비밀번호', type: 'password' },
      },
      authorize: async () => null,
    }),
  ],
  callbacks: {
    signIn({ account, profile }) {
      return account?.provider !== 'google' || isVerifiedGoogleProfile(profile);
    },
    authorized({ auth, request: { nextUrl } }) {
      const pathname = nextUrl.pathname;
      const isLoggedIn = !!auth?.user;

      const protectedPatterns = [
        /^\/library(?:\/.*)?$/,
        /^\/dashboard(?:\/.*)?$/,
        /^\/novels\/new\/?$/,
        /^\/novels\/[^/]+\/edit\/?$/,
        /^\/novels\/[^/]+\/chapters(?:\/.*)?$/,
        /^\/novels\/[^/]+\/characters(?:\/.*)?$/,
        /^\/settings(?:\/.*)?$/,
      ];
      const adminPatterns = [/^\/admin(?:\/.*)?$/];
      const authPatterns = [/^\/login\/?$/, /^\/register\/?$/];

      if (adminPatterns.some((pattern) => pattern.test(pathname))) {
        if (!isLoggedIn) return false;
        // Edge proxy의 JWT 역할은 승격·회수 직후 오래될 수 있다. 실제 관리자 확인은
        // Node 런타임의 페이지/API에서 현재 DB 역할로 수행한다.
        return true;
      }

      if (protectedPatterns.some((pattern) => pattern.test(pathname)) && !isLoggedIn) {
        return false;
      }

      if (authPatterns.some((pattern) => pattern.test(pathname)) && isLoggedIn) {
        return Response.redirect(new URL('/', nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.nickname = (user as { nickname?: string }).nickname;
        token.image = user.image;
        token.role = (user as { role?: 'USER' | 'AUTHOR' | 'ADMIN' }).role || 'USER';
        token.isVerifiedAuthor = (user as { isVerifiedAuthor?: boolean }).isVerifiedAuthor || false;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name;
        session.user.nickname = token.nickname as string | null;
        session.user.image = token.image as string | null;
        session.user.role = token.role as 'USER' | 'AUTHOR' | 'ADMIN';
        session.user.isVerifiedAuthor = token.isVerifiedAuthor as boolean;
      }
      return session;
    },
  },
};
