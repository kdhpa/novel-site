'use client';

import { clsx } from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
}

const variants = {
  default:
    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  success:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  warning:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  danger:
    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  info:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const sizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

export default function Badge({
  children,
  variant = 'default',
  size = 'sm',
}: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-full',
        variants[variant],
        sizes[size]
      )}
    >
      {children}
    </span>
  );
}

// Preset badges for common use cases
export function GenreBadge({ genre }: { genre: string }) {
  const genreLabels: Record<string, string> = {
    FANTASY: '판타지',
    ROMANCE: '로맨스',
    SF: 'SF',
    MARTIAL_ARTS: '무협',
    MYSTERY: '미스터리',
    HORROR: '호러',
    MODERN: '현대',
    OTHER: '기타',
  };

  return <Badge variant="info">{genreLabels[genre] || genre}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    ONGOING: { label: '연재중', variant: 'success' },
    COMPLETED: { label: '완결', variant: 'info' },
    HIATUS: { label: '휴재', variant: 'warning' },
  };

  const config = statusConfig[status] || { label: status, variant: 'default' };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
