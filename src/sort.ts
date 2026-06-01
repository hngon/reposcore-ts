import type {UserScore} from './score-calculator';

/** 정렬 기준(field)으로 허용되는 값들의 배열입니다. */
export const supportedSortBys = ['score', 'id'] as const;

/** 정렬 기준 타입 ('score' | 'id') */
export type SupportedSortBy = (typeof supportedSortBys)[number];

/** 정렬 방식(order)으로 허용되는 값들의 배열입니다. */
export const supportedSortOrders = ['asc', 'desc'] as const;

/** 정렬 방식 타입 ('asc' | 'desc') */
export type SupportedSortOrder = (typeof supportedSortOrders)[number];

/**
 * 사용자 점수 목록을 지정된 기준과 방식에 따라 정렬합니다.
 *
 * 기준이 `score`인 경우, 점수가 같으면 `id`를 기준으로 오름차순(asc) 2차 정렬을 수행하여
 * 항상 일관된 정렬 결과를 보장합니다. 원본 배열은 변경되지 않고 새로운 배열이 반환됩니다.
 *
 * @param users 정렬할 대상 사용자 점수 배열
 * @param sortBy 정렬 기준 (`'score'` 또는 `'id'`)
 * @param sortOrder 정렬 방식 (`'asc'` 또는 `'desc'`)
 * @returns 조건에 맞게 정렬된 새로운 사용자 점수 배열
 */
export function sortUserScores(
  users: ReadonlyArray<UserScore>,
  sortBy: SupportedSortBy,
  sortOrder: SupportedSortOrder,
): UserScore[] {
  return [...users].sort((a, b) => {
    if (sortBy === 'id') {
      const cmp = a.userId.localeCompare(b.userId);
      return sortOrder === 'asc' ? cmp : -cmp;
    } else {
      const cmp = a.totalScore - b.totalScore;
      if (cmp === 0) return a.userId.localeCompare(b.userId); // 점수 동률시 ID 오름차순
      return sortOrder === 'asc' ? cmp : -cmp;
    }
  });
}
