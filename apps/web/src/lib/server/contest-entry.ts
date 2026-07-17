import { ApiError } from './api';

type ContestBoundNovel = {
  seasonId: string | null;
  season?: { endsAt: Date } | null;
};

/**
 * 공모전 마감 시점의 응모작 내용을 보존한다. 작가는 응모를 철회한 뒤에만
 * 마감된 작품을 다시 수정할 수 있고, 관리자의 심사/운영 작업은 예외다.
 */
export function assertContestContentMutationAllowed(
  novel: ContestBoundNovel,
  options: { isAdmin: boolean; withdrawing?: boolean; now?: Date }
) {
  if (options.isAdmin || options.withdrawing || !novel.seasonId || !novel.season) return;
  if (novel.season.endsAt <= (options.now || new Date())) {
    throw new ApiError(
      409,
      '마감된 공모전 응모작은 수정할 수 없습니다. 작품 설정에서 응모를 철회한 뒤 수정해 주세요.'
    );
  }
}
