import {graphql} from '@octokit/graphql';

import type {
  ContributionLabel,
  DetailedRepoData,
  IssueRecord,
  PRRecord,
} from '../types';

import {loadCache, saveCache} from './cache';

type RawIssue = Omit<IssueRecord, 'category'>;
type RawPullRequest = Omit<PRRecord, 'category'>;

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface IssuePageResponse {
  repository: {
    issues: {
      nodes: (RawIssue & {stateReason: string | null})[];
      pageInfo: PageInfo;
    };
  };
}

interface PullRequestPageResponse {
  repository: {
    pullRequests: {
      nodes: RawPullRequest[];
      pageInfo: PageInfo;
    };
  };
}

const PAGE_SIZE = 100;

/**
 * 라벨 문자열을 ContributionLabel 카테고리로 정규화합니다.
 * * 소문자 변환 후 하이픈, 공백, 언더스코어를 제거하여 매칭합니다.
 * 인식되지 않는 라벨인 경우 'none'을 반환합니다.
 *
 * @param label 정규화할 원본 라벨 문자열
 * @returns 정규화된 ContributionLabel 카테고리 종류
 */
export const normalizeLabel = (label: string): ContributionLabel => {
  const key = label.toLowerCase().replace(/[-_\s]/g, '');
  if (key === 'feat' || key === 'feature' || key === 'enhancement')
    return 'feature';
  if (key === 'bug') return 'bug';
  if (key === 'doc' || key === 'docs' || key === 'documentation') return 'doc';
  if (key === 'typo') return 'typo';
  return 'none';
};

/**
 * 라벨 배열에서 첫 번째로 인식되는 ContributionLabel을 반환합니다.
 *
 * 배열을 순회하며 인식 가능한 유효 라벨이 발견되면 즉시 반환하고,
 * 유효한 라벨이 하나도 없으면 'none'을 반환합니다.
 *
 * @param labels 검사할 원본 라벨 문자열 배열
 * @returns 분류된 첫 번째 유효 ContributionLabel 카테고리
 */
export const categorizeLabels = (labels: string[]): ContributionLabel => {
  for (const label of labels) {
    const category = normalizeLabel(label);
    if (category !== 'none') {
      return category;
    }
  }
  return 'none';
};

/**
 * GitHub API 응답 객체에서 라벨 이름들만 문자열 배열로 추출합니다.
 *
 * @param labels GraphQL 응답에서 받아온 라벨 노드 객체 또는 null
 * @returns 추출된 라벨 이름 문자열 배열
 */
const extractLabelNames = (
  labels: {nodes: {name: string}[]} | null,
): string[] => {
  if (!labels || !labels.nodes) return [];
  return labels.nodes.map(node => node.name).filter(name => Boolean(name));
};

/**
 * GraphQL로 받아온 원본 이슈 데이터를 시스템 표준 IssueRecord 형식으로 변환합니다.
 *
 * @param raw 라벨 가공 전의 원본 이슈 데이터
 * @returns 카테고리 정보가 포함되어 가공된 IssueRecord 객체
 */
const toIssueRecord = (raw: RawIssue): IssueRecord => {
  return {
    ...raw,
    category: categorizeLabels(extractLabelNames(raw.labels)),
  };
};

/**
 * GraphQL로 받아온 원본 Pull Request 데이터를 시스템 표준 PRRecord 형식으로 변환합니다.
 *
 * @param raw 라벨 가공 전의 원본 Pull Request 데이터
 * @returns 카테고리 정보가 포함되어 가공된 PRRecord 객체
 */
const toPrRecord = (raw: RawPullRequest): PRRecord => {
  return {
    ...raw,
    category: categorizeLabels(extractLabelNames(raw.labels)),
  };
};

// DetailedRepoData에서 카테고리별 개수를 집계합니다.
export interface CategoryCounts {
  feature: number;
  bug: number;
  doc: number;
  typo: number;
  none: number;
}
/**
 * 데이터 목록에서 각 기여 카테고리(Feature, Bug, Doc 등)별 발생 개수를 집계합니다.
 *
 * @param records 카테고리 정보가 포함된 기여 데이터 배열
 * @returns 카테고리별 집계 개수가 담긴 CategoryCounts 객체
 */
export const countByCategory = (
  records: ReadonlyArray<{category: ContributionLabel}>,
): CategoryCounts => {
  const counts: CategoryCounts = {
    feature: 0,
    bug: 0,
    doc: 0,
    typo: 0,
    none: 0,
  };
  for (const record of records) {
    counts[record.category] += 1;
  }
  return counts;
};

/**
 * GitHub GraphQL API 통신을 담당하는 GitHub 서비스 인스턴스를 생성합니다.
 *
 * @param token GitHub API 호출에 사용할 개인 접근 토큰 (Personal Access Token)
 * @returns 저장소 데이터 조회가 가능한 기능 객체
 */
export const createGitHubService = (token: string) => {
  const githubGraphQL = graphql.defaults({
    headers: {
      authorization: `token ${token}`,
    },
  });

  /**
   * 대상 저장소에서 모든 이슈 데이터를 조회합니다.
   * * GraphQL 기반의 cursor 페이지네이션을 이용하여 모든 페이지의 데이터를 순회 수집합니다.
   *
   * @param owner 저장소 소유자 ID 혹은 조직명
   * @param repo 저장소 이름
   * @returns 가공된 전체 IssueRecord 데이터 배열
   */
  const getAllValidIssues = async (
    owner: string,
    repo: string,
  ): Promise<IssueRecord[]> => {
    const issues: IssueRecord[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const response: IssuePageResponse =
        await githubGraphQL<IssuePageResponse>(
          `
        query(
          $owner: String!
          $repo: String!
          $pageSize: Int!
          $cursor: String
        ) {
          repository(owner: $owner, name: $repo) {
            issues(
              first: $pageSize
              after: $cursor
              orderBy: {field: CREATED_AT, direction: DESC}
            ) {
              nodes {
                number
                title
                url
                state
                stateReason
                createdAt
                closedAt
                author { login }
                labels(first: 20) { nodes { name } }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
        `,
          {owner, repo, pageSize: PAGE_SIZE, cursor},
        );

      const connection: IssuePageResponse['repository']['issues'] =
        response.repository.issues;

      // OPEN 상태이거나 CLOSE된 상태 중에서도 정상적으로 종료된(COMPLETED) 이슈만 유효한 데이터로 필터링합니다.
      const validNodes = connection.nodes.filter(
        node => node.state === 'OPEN' || node.stateReason === 'COMPLETED',
      );

      issues.push(...validNodes.map(toIssueRecord));

      cursor = connection.pageInfo.endCursor;
      hasNextPage = connection.pageInfo.hasNextPage && cursor !== null;
    }

    return issues;
  };

  /**
   * 대상 저장소에서 병합된(MERGED) 상태의 모든 Pull Request 데이터를 조회합니다.
   *
   * GraphQL 기반의 cursor 페이지네이션을 이용하여 모든 페이지의 데이터를 순회 수집합니다.
   *
   * @param owner 저장소 소유자 ID 혹은 조직명
   * @param repo 저장소 이름
   * @returns 가공된 전체 PRRecord 데이터 배열
   */
  const getAllMergedPullRequests = async (
    owner: string,
    repo: string,
  ): Promise<PRRecord[]> => {
    const prs: PRRecord[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const response: PullRequestPageResponse =
        await githubGraphQL<PullRequestPageResponse>(
          `
        query(
          $owner: String!
          $repo: String!
          $pageSize: Int!
          $cursor: String
        ) {
          repository(owner: $owner, name: $repo) {
            pullRequests(
              first: $pageSize
              after: $cursor
              states: MERGED
              orderBy: {field: CREATED_AT, direction: DESC}
            ) {
              nodes {
                number
                title
                url
                merged
                mergedAt
                additions
                deletions
                author { login }
                labels(first: 20) { nodes { name } }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
        `,
          {owner, repo, pageSize: PAGE_SIZE, cursor},
        );

      const connection: PullRequestPageResponse['repository']['pullRequests'] =
        response.repository.pullRequests;

      prs.push(...connection.nodes.map(toPrRecord));

      cursor = connection.pageInfo.endCursor;
      hasNextPage = connection.pageInfo.hasNextPage && cursor !== null;
    }

    return prs;
  };

  /**
   * Closed 이슈와 Merged PR 데이터를 각각 cursor 기반 페이지네이션으로 통합 조회합니다.
   *
   * useCache 가 true(기본값)인 경우 로컬 캐시 파일(.cache/<owner>_<repo>.json)을 우선적으로 확인하며,
   * 캐시가 없거나 useCache 가 false인 경우에만 GitHub API를 원격 호출한 후 결과를 다시 캐싱합니다.
   *
   * @param owner 저장소 소유자 ID 혹은 조직명
   * @param repo 저장소 이름
   * @param useCache 파일 캐시 시스템 적용 여부 (기본값: true)
   * @returns 이슈와 PR 데이터가 통합된 DetailedRepoData 객체
   */
  const getDetailedRepoData = async (
    owner: string,
    repo: string,
    useCache = true,
  ): Promise<DetailedRepoData> => {
    const cached = await loadCache<DetailedRepoData>(owner, repo, !useCache);
    if (cached) return cached.data;

    const [issues, prs] = await Promise.all([
      getAllValidIssues(owner, repo),
      getAllMergedPullRequests(owner, repo),
    ]);

    const data: DetailedRepoData = {
      issues,
      prs,
    };

    await saveCache(owner, repo, data);

    return data;
  };

  return {
    getDetailedRepoData,
  };
};
