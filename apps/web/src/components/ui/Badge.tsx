import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { GenreLabels, StatusLabels, ApprovalStatusLabels } from '@/types';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'romance' | 'ranking';
  size?: 'sm' | 'md';
}

const variants = {
  default: 'bg-background-tertiary text-zinc-300 border-border',
  success: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/25',
  warning: 'bg-amber-500/10 text-amber-200 border-amber-500/25',
  danger: 'bg-rose-500/10 text-rose-200 border-rose-500/25',
  info: 'bg-teal-500/10 text-teal-200 border-teal-500/25',
  primary: 'bg-primary/10 text-[#9adbd2] border-primary/30',
  romance: 'bg-[#b66a86]/12 text-[#e0a8bb] border-[#b66a86]/30',
  ranking: 'bg-accent/10 text-accent border-accent-muted',
};

const sizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

export default function Badge({ children, variant = 'default', size = 'sm' }: BadgeProps) {
  return (
    <span className={clsx('inline-flex items-center rounded border font-medium leading-none whitespace-nowrap', variants[variant], sizes[size])}>
      {children}
    </span>
  );
}

const genreColors: Record<string, BadgeProps['variant']> = {
  FANTASY: 'info',
  ROMANCE: 'romance',
  SF: 'primary',
  MARTIAL_ARTS: 'warning',
  MYSTERY: 'default',
  HORROR: 'danger',
  MODERN: 'success',
  OTHER: 'default',
};

export function GenreBadge({ genre }: { genre: string }) {
  return (
    <Badge variant={genreColors[genre] || 'default'}>
      {GenreLabels[genre as keyof typeof GenreLabels] || '기타'}
    </Badge>
  );
}

export function GenresBadge({ genres, maxDisplay = 2 }: { genres: string[]; maxDisplay?: number }) {
  if (!genres?.length) return null;

  return (
    <>
      {genres.slice(0, maxDisplay).map((genre) => (
        <GenreBadge key={genre} genre={genre} />
      ))}
      {genres.length > maxDisplay && <span className="text-xs text-zinc-500">+{genres.length - maxDisplay}</span>}
    </>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const variant: BadgeProps['variant'] = status === 'ONGOING' ? 'success' : status === 'COMPLETED' ? 'info' : 'warning';

  return <Badge variant={variant}>{StatusLabels[status as keyof typeof StatusLabels] || '상태 미상'}</Badge>;
}

export function ApprovalStatusBadge({ status }: { status: string }) {
  const variant: BadgeProps['variant'] =
    status === 'APPROVED'
      ? 'success'
      : status === 'REJECTED'
        ? 'danger'
        : status === 'PENDING_REVIEW'
          ? 'warning'
          : 'default';

  return <Badge variant={variant}>{ApprovalStatusLabels[status as keyof typeof ApprovalStatusLabels] || '심사 상태 미상'}</Badge>;
}
