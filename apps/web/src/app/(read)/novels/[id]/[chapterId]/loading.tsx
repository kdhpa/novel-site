function Skeleton({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-zinc-800 ${className}`} />;
}

const paragraphWidths = ['w-full', 'w-11/12', 'w-full', 'w-4/5', 'w-full', 'w-10/12', 'w-full', 'w-3/4'];

export default function ChapterReaderLoading() {
  return (
    <div
      className="min-h-screen bg-[#0b0c0e] text-zinc-200"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="회차 본문을 불러오는 중"
    >
      <span className="sr-only">회차 본문을 불러오는 중입니다.</span>

      <div aria-hidden="true" className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Skeleton className="h-4 w-20" />
          <div className="flex flex-col items-center gap-1.5">
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      <main aria-hidden="true" className="mx-auto max-w-[720px] px-4 pb-28 pt-24">
        <header className="mb-12 flex flex-col items-center gap-3 text-center">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-8 w-3/5 min-w-52" />
        </header>

        <article className="space-y-5">
          {paragraphWidths.map((width, index) => (
            <div key={index} className="space-y-2.5">
              <Skeleton className={`h-4 ${width}`} />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ))}
        </article>
      </main>

      <div aria-hidden="true" className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </div>
  );
}
