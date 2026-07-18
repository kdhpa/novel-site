import type { Role } from '@novelverse/db/browser';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      nickname?: string | null;
      image?: string | null;
      role: Role;
      isVerifiedAuthor?: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    nickname?: string | null;
    image?: string | null;
    role: Role;
    isVerifiedAuthor?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    sessionIssuedAt?: number;
    email?: string | null;
    name?: string | null;
    nickname?: string | null;
    image?: string | null;
    role: Role;
    isVerifiedAuthor?: boolean;
  }
}
