function Skeleton({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-background-tertiary ${className}`} />;
}

export default function AppLoading() {
  return (
    <div
      className="mx-auto min-h-[70vh] w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="페이지를 불러오는 중"
    >
      <span className="sr-only">페이지를 불러오는 중입니다.</span>
      <Skeleton className="h-7 w-44" />
      <Skeleton className="mt-3 h-4 w-72 max-w-full" />
      <Skeleton className="mt-6 h-56 w-full" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-40 w-full" />
        ))}
      </div>
      <div className="mt-8 space-y-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
