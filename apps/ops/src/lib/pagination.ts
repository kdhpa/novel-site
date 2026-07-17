export function parsePage(value: string | null | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function parseLimit(
  value: string | null | undefined,
  fallback: number,
  maximum = 100
) {
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0
    ? Math.min(limit, maximum)
    : fallback;
}
