import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import AccountSettings from './AccountSettings';

export const metadata: Metadata = {
  title: '계정 설정',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    deleteToken?: string | string[];
    exportToken?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const rawDeleteToken = params.deleteToken;
  const rawExportToken = params.exportToken;
  const initialDeletionToken = typeof rawDeleteToken === 'string'
    && /^[A-Za-z0-9_-]{32,128}$/.test(rawDeleteToken)
    ? rawDeleteToken
    : '';
  const initialExportToken = typeof rawExportToken === 'string'
    && /^[A-Za-z0-9_-]{32,128}$/.test(rawExportToken)
    ? rawExportToken
    : '';
  const session = await auth();
  if (!session?.user?.id) {
    const callbackParams = new URLSearchParams();
    if (initialDeletionToken) callbackParams.set('deleteToken', initialDeletionToken);
    if (initialExportToken) callbackParams.set('exportToken', initialExportToken);
    const callbackUrl = callbackParams.size
      ? `/settings?${callbackParams.toString()}`
      : '/settings';
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, password: true },
  });
  if (!user) redirect('/login');

  return (
    <AccountSettings
      email={user.email}
      hasPassword={Boolean(user.password)}
      initialDeletionToken={initialDeletionToken}
      initialExportToken={initialExportToken}
    />
  );
}
