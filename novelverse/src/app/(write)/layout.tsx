import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';

export default async function WriteLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login?callbackUrl=/dashboard');
  }

  return (
    <div className="flex min-h-[calc(100vh-200px)]">
      <Sidebar className="hidden md:block" />
      <div className="flex-1 p-6 md:p-8">
        {children}
      </div>
    </div>
  );
}
