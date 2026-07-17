import NovelForm from '@/components/editor/NovelForm';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getOpenSeasonOptions } from '@/lib/server/seasons';

export const metadata: Metadata = {
  title: '새 작품 초안',
  description: '새로운 웹소설의 초안을 만드세요.',
};

export default async function NewNovelPage() {
  const [session, seasons] = await Promise.all([auth(), getOpenSeasonOptions()]);
  if (!session?.user) redirect('/login?callbackUrl=/novels/new');

  return (
    <div className="mx-auto max-w-3xl px-3 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">새 작품 초안</h1>
        <p className="mt-2 text-sm text-zinc-500">초안을 만든 뒤 회차를 작성하고 공개 심사를 요청할 수 있습니다.</p>
      </div>
      <div className="rounded-lg border border-border bg-background-secondary p-4 sm:p-6">
        <NovelForm mode="create" seasons={seasons} />
      </div>
    </div>
  );
}
