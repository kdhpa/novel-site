import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@novelverse/db';

function toPlainText(html: string) {
  return html
    .replace(/<(?:br|\/p|\/div|\/li|\/blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default async function ReviewChapterPage({
  params,
}: {
  params: Promise<{ id: string; chapterId: string }>;
}) {
  const { id, chapterId } = await params;
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, novelId: id, novel: { approvalStatus: 'PENDING_REVIEW' } },
    select: {
      chapterNumber: true,
      title: true,
      content: true,
      novel: { select: { title: true } },
    },
  });
  if (!chapter) notFound();

  return (
    <article>
      <Link href={`/reviews/${id}`} className="text-sm text-muted hover:text-foreground">← 작품 심사로</Link>
      <p className="mt-4 text-sm text-muted">{chapter.novel.title}</p>
      <h1 className="mt-1 text-2xl font-bold text-foreground">
        {chapter.chapterNumber}화 · {chapter.title}
      </h1>
      <div className="mt-6 whitespace-pre-wrap rounded-lg border border-border bg-surface p-6 text-[15px] leading-8 text-foreground">
        {toPlainText(chapter.content) || '본문이 없습니다.'}
      </div>
    </article>
  );
}
