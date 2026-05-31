/**
 * reposcore-ts 도메인 공용 타입 모듈.
 *
 * `github-service.ts`(데이터 생산)와 `score-calculator.ts`(점수 계산)가
 * 동일한 shape을 직접 공유하기 위해 타입 정의를 한곳에 모읍니다.
 *
 * @packageDocumentation
 */

/**
 * 라벨에서 정규화된 기여 종류.
 *
 * - `feature`: 기능 추가
 * - `bug`: 버그 수정
 * - `doc`: 문서
 * - `typo`: 오타 수정
 */
export type ContributionKind = 'feature' | 'bug' | 'doc' | 'typo';

/**
 * 점수 산정에 쓰이는 기여 분류 라벨.
 *
 * {@link ContributionKind}에 더해, 인식 가능한 라벨이 없으면 `none`으로 표현합니다.
 */
export type ContributionLabel = ContributionKind | 'none';

/**
 * 이슈와 PR이 공통으로 가지는 기본 레코드.
 */
export interface BaseRecord {
  /** GitHub 이슈/PR 번호. */
  number: number;
  /** 제목. */
  title: string;
  /** GitHub 웹 URL. */
  url: string;
  /**
   * 작성자 정보. 계정이 삭제되었거나 봇 등으로 작성자를 알 수 없으면 `null`입니다.
   */
  author: {login: string} | null;
  /**
   * 부착된 라벨 목록. 라벨이 없거나 응답에 포함되지 않으면 `null`입니다.
   */
  labels: {nodes: {name: string}[]} | null;
  /**
   * 라벨에서 정규화된 기여 분류. 인식 가능한 라벨이 없으면 `none`입니다.
   */
  category: ContributionLabel;
}

/**
 * Pull Request 레코드. {@link BaseRecord}를 확장합니다.
 */
export interface PRRecord extends BaseRecord {
  /** 병합 여부. */
  merged: boolean;
  /** 병합 시각(ISO 8601). 병합되지 않았으면 `null`입니다. */
  mergedAt: string | null;
  /** 추가된 라인 수. */
  additions: number;
  /** 삭제된 라인 수. */
  deletions: number;
}

/**
 * 이슈 레코드. {@link BaseRecord}를 확장합니다.
 */
export interface IssueRecord extends BaseRecord {
  /** 이슈 상태(예: `OPEN`, `CLOSED`). */
  state: string;
  /** 생성 시각(ISO 8601). */
  createdAt: string;
  /** 종료 시각(ISO 8601). 아직 닫히지 않았으면 `null`입니다. */
  closedAt: string | null;
}

/**
 * 한 저장소에서 수집한 상세 데이터. 점수 계산의 입력으로 사용됩니다.
 */
export interface DetailedRepoData {
  /** 수집된 PR 목록. */
  prs: PRRecord[];
  /** 수집된 이슈 목록. */
  issues: IssueRecord[];
}
