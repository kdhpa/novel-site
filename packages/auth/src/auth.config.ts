import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { mapVerifiedGoogleProfile } from '@novelverse/shared';
import { isAllowedOpsGoogleProfile, isOpsPasswordLoginEnabled } from './provider-policy';

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
    ...(isOpsPasswordLoginEnabled()
      ? [Credentials({
          name: 'credentials',
          credentials: {
            email: { label: 'Email', type: 'email' },
            password: { label: 'Password', type: 'password' },
          },
          authorize: async () => null,
        })]
      : []),
  ],
  callbacks: {
    signIn({ account, profile }) {
      return account?.provider !== 'google' || isAllowedOpsGoogleProfile(profile);
    },
    authorized({ auth, request: { nextUrl } }) {
      const pathname = nextUrl.pathname;
      const isLoggedIn = !!auth?.user;
      const user = auth?.user as { role?: string } | undefined;

      const protectedPatterns = [
        /^\/library(?:\/.*)?$/,
        /^\/dashboard(?:\/.*)?$/,
        /^\/novels\/new\/?$/,
        /^\/novels\/[^/]+\/edit\/?$/,
        /^\/novels\/[^/]+\/chapters(?:\/.*)?$/,
        /^\/novels\/[^/]+\/characters(?:\/.*)?$/,
      ];
      const adminPatterns = [/^\/admin(?:\/.*)?$/];
      const authPatterns = [/^\/login\/?$/, /^\/register\/?$/];

      if (adminPatterns.some((pattern) => pattern.test(pathname))) {
        if (!isLoggedIn) return false;
        if (user?.role !== 'ADMIN') return Response.redirect(new URL('/', nextUrl));
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
        const appUser = user as {
          id: string;
          email?: string | null;
          name?: string | null;
          nickname?: string | null;
          image?: string | null;
          role?: 'USER' | 'AUTHOR' | 'ADMIN';
          isVerifiedAuthor?: boolean;
        };

        token.id = appUser.id;
        token.email = appUser.email;
        token.name = appUser.name;
        token.nickname = appUser.nickname;
        token.image = appUser.image;
        token.role = appUser.role || 'USER';
        token.isVerifiedAuthor = appUser.isVerifiedAuthor || false;
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
