'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookPlus, Gauge, Library } from 'lucide-react';
import { clsx } from 'clsx';

const dashboardLinks = [
  { href: '/dashboard', label: '\uB300\uC2DC\uBCF4\uB4DC', icon: <Gauge className="h-5 w-5" /> },
  { href: '/novels/new', label: '\uC0C8 \uC791\uD488 \uB4F1\uB85D', icon: <BookPlus className="h-5 w-5" /> },
  { href: '/library', label: '\uB0B4 \uC11C\uC7AC', icon: <Library className="h-5 w-5" /> },
];

interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={clsx('min-h-screen w-64 border-r border-border bg-background-secondary/70', className)}>
      <div className="border-b border-border p-5">
        <p className="text-sm font-semibold text-white">{'\uC791\uAC00\uC13C\uD130'}</p>
        <p className="mt-1 text-xs text-zinc-500">{'\uC791\uD488, \uD68C\uCC28, \uACF5\uAC1C \uC0C1\uD0DC \uAD00\uB9AC'}</p>
      </div>
      <nav className="space-y-1 p-3">
        {dashboardLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? 'page' : undefined}
              className={clsx(
                'flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition-colors',
                isActive ? 'bg-primary text-white' : 'text-zinc-400 hover:bg-background-tertiary hover:text-white'
              )}
            >
              {link.icon}
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
