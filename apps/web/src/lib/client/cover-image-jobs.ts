export const COVER_IMAGE_JOB_STORAGE_PREFIX = 'novelverse.coverImageJobs.v1';
export const DRAFT_COVER_IMAGE_JOB_STORAGE_ID = 'draft';

export function getCoverImageJobStorageKey(ownerUserId: string, novelId?: string) {
  return `${COVER_IMAGE_JOB_STORAGE_PREFIX}:${ownerUserId}:${novelId || DRAFT_COVER_IMAGE_JOB_STORAGE_ID}`;
}

export function transferDraftCoverImageJobs(ownerUserId: string, novelId: string) {
  if (typeof window === 'undefined' || !ownerUserId) return 0;

  const draftKey = getCoverImageJobStorageKey(ownerUserId);
  const novelKey = getCoverImageJobStorageKey(ownerUserId, novelId);
  const draftJobs = window.localStorage.getItem(draftKey);

  if (!draftJobs) return 0;

  try {
    const parsedDraftJobs = (JSON.parse(draftJobs) as unknown[]).filter(
      (job) => typeof job === 'object' && job !== null &&
        'ownerUserId' in job && job.ownerUserId === ownerUserId
    );
    const parsedNovelJobs = (JSON.parse(
      window.localStorage.getItem(novelKey) || '[]'
    ) as unknown[]).filter(
      (job) => typeof job === 'object' && job !== null &&
        'ownerUserId' in job && job.ownerUserId === ownerUserId
    );
    const draftJobIds = new Set(
      parsedDraftJobs
        .map((job) =>
          typeof job === 'object' && job !== null && 'id' in job ? String(job.id) : ''
        )
        .filter(Boolean)
    );
    const mergedJobs = [
      ...parsedDraftJobs,
      ...parsedNovelJobs.filter((job) => {
        if (typeof job !== 'object' || job === null || !('id' in job)) return true;
        return !draftJobIds.has(String(job.id));
      }),
    ].slice(0, 10);

    window.localStorage.setItem(novelKey, JSON.stringify(mergedJobs));
    window.localStorage.removeItem(draftKey);

    return parsedDraftJobs.length;
  } catch {
    window.localStorage.removeItem(draftKey);
    return 0;
  }
}
