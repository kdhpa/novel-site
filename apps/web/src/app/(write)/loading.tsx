function Skeleton({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-background-tertiary ${className}`} />;
}

export default function WriteLoading() {
  return (
    <div className="min-h-screen bg-background" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">작가 화면을 불러오는 중입니다.</span>
      <div className="border-b border-border bg-background/95">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-9 w-48" />
          <Skeleton className="mt-3 h-4 w-72 max-w-full" />
        </div>
      </div>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} aria-hidden="true" className="rounded-md border border-border bg-background-secondary p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="mt-3 h-4 w-3/4" />
              </div>
              <Skeleton className="h-10 w-28 shrink-0" />
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
