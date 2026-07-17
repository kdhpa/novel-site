'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { SessionProvider } from 'next-auth/react';
import { type ReactNode } from 'react';

interface ProvidersProps {
  children: ReactNode;
  nonce?: string;
}

export default function Providers({ children, nonce }: ProvidersProps) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        disableTransitionOnChange
        nonce={nonce}
      >
        {children}
      </NextThemesProvider>
    </SessionProvider>
  );
}
