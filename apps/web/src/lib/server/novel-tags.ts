import type { Prisma } from '@novelverse/db/client';
import { normalizeNfkcTrim, normalizeTagKey } from '@novelverse/shared';

export function normalizeTagNames(tagNames: string[]) {
  const normalized = new Map<string, string>();
  for (const value of tagNames) {
    const name = normalizeNfkcTrim(value);
    if (!name) continue;
    const normalizedName = normalizeTagKey(name);
    if (!normalized.has(normalizedName)) normalized.set(normalizedName, name);
  }
  return [...normalized].map(([normalizedName, name]) => ({ name, normalizedName }));
}

export async function replaceNovelTags(
  transaction: Prisma.TransactionClient,
  novelId: string,
  tagNames: string[],
  options: { clearExisting?: boolean } = {}
) {
  const tagsToStore = normalizeTagNames(tagNames);

  if (options.clearExisting !== false) {
    await transaction.tagsOnNovels.deleteMany({ where: { novelId } });
  }
  if (tagsToStore.length === 0) return;

  await transaction.tag.createMany({
    data: tagsToStore,
    skipDuplicates: true,
  });

  const tags = await transaction.tag.findMany({
    where: { normalizedName: { in: tagsToStore.map((tag) => tag.normalizedName) } },
    select: { id: true },
  });

  await transaction.tagsOnNovels.createMany({
    data: tags.map((tag) => ({ novelId, tagId: tag.id })),
    skipDuplicates: true,
  });
}
