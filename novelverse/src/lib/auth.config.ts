// NextAuth configuration without Prisma adapter (Edge compatible)
import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';

export const authConfig: NextAuthConfig = {
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      // Authorize function is only used in the full auth.ts (not edge)
      authorize: async () => null,
    }),
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      // Protected routes patterns
      const protectedPatterns = [
        /^\/dashboard/,
        /^\/novels\/new/,
        /^\/novels\/[^/]+\/edit/,
        /^\/novels\/[^/]+\/chapters/,
      ];

      // Auth routes (only for non-authenticated users)
      const authPatterns = [/^\/login/, /^\/register/];

      const isProtectedRoute = protectedPatterns.some((pattern) =>
        pattern.test(pathname)
      );
      const isAuthRoute = authPatterns.some((pattern) =>
        pattern.test(pathname)
      );

      if (isProtectedRoute && !isLoggedIn) {
        return false; // Redirect to login
      }

      if (isAuthRoute && isLoggedIn) {
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
        token.role = (user as { role?: string }).role;
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
      }
      return session;
    },
  },
};
