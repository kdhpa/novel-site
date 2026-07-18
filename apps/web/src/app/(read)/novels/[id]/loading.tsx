function Skeleton({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse bg-background-tertiary ${className}`} />;
}

export default function NovelDetailLoading() {
  return (
    <div
      className="min-h-screen bg-background"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="작품 정보를 불러오는 중"
    >
      <span className="sr-only">작품 정보를 불러오는 중입니다.</span>

      <section className="border-b border-border bg-background-secondary/30">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-7 md:grid-cols-[220px_1fr]">
            <div className="mx-auto w-44 md:mx-0 md:w-full">
              <Skeleton className="aspect-[3/4] w-full rounded-md border border-border" />
            </div>

            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-14 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>

              <div className="flex flex-col items-center md:items-start">
                <Skeleton className="h-9 w-4/5 max-w-lg rounded-md md:h-10" />
                <Skeleton className="mt-3 h-5 w-36 rounded-md" />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5 md:max-w-3xl">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    aria-hidden="true"
                    className="rounded-md border border-border bg-background-secondary p-3"
                  >
                    <div className="mb-2 h-3 w-12 animate-pulse rounded bg-background-tertiary" />
                    <div className="h-4 w-16 animate-pulse rounded bg-background-tertiary" />
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
                <Skeleton className="h-7 w-20 rounded-md" />
                <Skeleton className="h-7 w-24 rounded-md" />
                <Skeleton className="h-7 w-16 rounded-md" />
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 md:justify-start">
                <Skeleton className="h-11 w-28 rounded-md" />
                <Skeleton className="h-11 w-24 rounded-md border border-border" />
                <Skeleton className="h-11 w-24 rounded-md border border-border" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div aria-hidden="true" className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl gap-1 px-4 sm:px-6 lg:px-8">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="px-5 py-4">
              <div className="h-4 w-10 animate-pulse rounded bg-background-tertiary" />
            </div>
          ))}
        </div>
      </div>

      <main aria-hidden="true" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="mb-8 rounded-md border border-border bg-background-secondary p-5">
          <Skeleton className="mb-4 h-6 w-24 rounded-md" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-11/12 rounded" />
            <Skeleton className="h-4 w-3/5 rounded" />
          </div>
        </section>

        <section className="mb-8 overflow-hidden rounded-md border border-border bg-background-secondary">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Skeleton className="h-5 w-20 rounded-md" />
            <Skeleton className="h-4 w-14 rounded-md" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4 px-4 py-4">
                <Skeleton className="h-4 w-10 shrink-0 rounded" />
                <Skeleton className="h-4 flex-1 rounded" />
                <Skeleton className="hidden h-4 w-20 rounded sm:block" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-border bg-background-secondary p-5">
          <Skeleton className="mb-5 h-6 w-16 rounded-md" />
          <Skeleton className="h-24 w-full rounded-md" />
        </section>
      </main>
    </div>
  );
}
