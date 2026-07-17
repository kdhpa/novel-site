import Card from '@/components/ui/Card';

export default function AuthLoading() {
  return (
    <Card padding="lg">
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">인증 화면을 불러오는 중입니다.</span>
        <div aria-hidden="true" className="space-y-5">
          <div className="mx-auto h-8 w-28 animate-pulse rounded bg-background-tertiary" />
          <div className="mx-auto h-4 w-56 max-w-full animate-pulse rounded bg-background-tertiary" />
          <div className="pt-4">
            <div className="h-11 animate-pulse rounded-lg bg-background-tertiary" />
            <div className="mt-4 h-11 animate-pulse rounded-lg bg-background-tertiary" />
            <div className="mt-5 h-11 animate-pulse rounded-lg bg-background-tertiary" />
          </div>
        </div>
      </div>
    </Card>
  );
}
