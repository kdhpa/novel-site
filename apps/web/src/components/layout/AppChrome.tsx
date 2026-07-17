'use client';

import { ReactNode, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import Footer from '@/components/layout/Footer';

const Header = dynamic(() => import('@/components/layout/Header'), {
  loading: () => <div className="h-[69px] border-b border-border bg-background" />,
});
const MobileBottomNav = dynamic(() => import('@/components/layout/MobileBottomNav'));

function isWriterPath(pathname: string) {
  return (
    pathname === '/dashboard' ||
    pathname === '/novels/new' ||
    /^\/novels\/[^/]+\/edit$/.test(pathname) ||
    /^\/novels\/[^/]+\/chapters(\/.*)?$/.test(pathname) ||
    /^\/novels\/[^/]+\/characters(\/.*)?$/.test(pathname)
  );
}

export default function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isWriter = isWriterPath(pathname);
  const isReader = !isWriter && /^\/novels\/[^/]+\/[^/]+$/.test(pathname);
  const showChrome = !isWriter && !isReader;

  return (
    <div className="min-h-screen flex flex-col">
      {showChrome && (
        <Suspense fallback={<div className="h-[69px] border-b border-border bg-background" />}>
          <Header />
        </Suspense>
      )}
      <main className={`flex-1 ${showChrome ? 'pb-20 md:pb-0' : ''}`}>{children}</main>
      {showChrome && <Footer />}
      {showChrome && <MobileBottomNav />}
    </div>
  );
}
