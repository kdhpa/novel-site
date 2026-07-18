import { redirect } from 'next/navigation';
import { auth } from '@novelverse/auth';
import { prisma } from '@novelverse/db';
import OpsChrome from './OpsChrome';

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login?callbackUrl=/');
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (currentUser?.role !== 'ADMIN') {
    redirect('/login?error=AccessDenied');
  }

  return (
    <OpsChrome
      userLabel={session.user.nickname || session.user.email || '관리자'}
      email={session.user.email || ''}
    >
      {children}
    </OpsChrome>
  );
}
