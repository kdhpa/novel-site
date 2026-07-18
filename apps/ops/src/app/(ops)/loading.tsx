function Skeleton({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-surface-muted ${className}`} />;
}

export default function OpsLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="관리 화면을 불러오는 중">
      <Skeleton className="mb-3 h-8 w-48" />
      <Skeleton className="mb-8 h-4 w-80 max-w-full" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface p-4">
        <Skeleton className="mb-4 h-10 w-full" />
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="mb-3 h-14 w-full last:mb-0" />
        ))}
      </div>
    </div>
  );
}
