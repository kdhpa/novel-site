import type { Metadata } from 'next';
import { connection } from 'next/server';
import { headers } from 'next/headers';
import './globals.css';
import Providers from '@/components/providers/ThemeProvider';
import AppChrome from '@/components/layout/AppChrome';
import { DEFAULT_SOCIAL_IMAGE, getSiteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: SITE_TITLE,
    template: '%s | NovelVerse',
  },
  description: SITE_DESCRIPTION,
  keywords: ['웹소설', '연재', 'AI 이미지', '작가센터', '랭킹', '서재'],
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: DEFAULT_SOCIAL_IMAGE, alt: 'NovelVerse 웹소설 플랫폼' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_SOCIAL_IMAGE],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="ko" suppressHydrationWarning className="dark">
      <body className="bg-background font-sans text-foreground antialiased">
        <Providers nonce={nonce}>
          <AppChrome>{children}</AppChrome>
        </Providers>
      </body>
    </html>
  );
}
