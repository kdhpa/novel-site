import prisma from '@/lib/prisma';
import { ApiError } from '@/lib/server/api';
import type { SeasonOption } from '@/types';
import type { Prisma } from '@novelverse/db/client';

export function openSeasonWhere(now = new Date()): Prisma.SeasonWhereInput {
  return {
    isActive: true,
    startsAt: { lte: now },
    endsAt: { gte: now },
  };
}

function toSeasonOption(season: {
  id: string;
  slug: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
}): SeasonOption {
  return {
    id: season.id,
    slug: season.slug,
    title: season.title,
    startsAt: season.startsAt.toISOString(),
    endsAt: season.endsAt.toISOString(),
    isActive: season.isActive,
  };
}

export async function getOpenSeasonOptions(includeSeasonId?: string | null): Promise<SeasonOption[]> {
  const now = new Date();
  const where: Prisma.SeasonWhereInput = includeSeasonId
    ? { OR: [openSeasonWhere(now), { id: includeSeasonId }] }
    : openSeasonWhere(now);

  const seasons = await prisma.season.findMany({
    where,
    orderBy: [{ endsAt: 'asc' }, { startsAt: 'asc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      endsAt: true,
      isActive: true,
    },
  });

  return seasons.map(toSeasonOption);
}

export async function resolveNovelSeasonId(
  seasonId: string | null | undefined,
  options: {
    currentSeasonId?: string | null;
    client?: Pick<Prisma.TransactionClient, 'season'>;
  } = {}
) {
  if (seasonId === undefined) return undefined;
  if (seasonId === null) return null;

  const trimmed = seasonId.trim();
  if (!trimmed) return null;
  if (options.currentSeasonId && trimmed === options.currentSeasonId) return trimmed;

  const client = options.client || prisma;
  const season = await client.season.findFirst({
    where: { id: trimmed, ...openSeasonWhere() },
    select: { id: true },
  });

  if (!season) {
    throw new ApiError(400, '접수 중인 시즌만 선택할 수 있습니다.');
  }

  return season.id;
}
