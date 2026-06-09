import {graphql} from '@octokit/graphql';

import type {
  ContributionLabel,
  DetailedRepoData,
  ClaimInfo,
  RepoClaims,
  IssueRecord,
  PRRecord,
} from './types';

import {loadCache, saveCache} from './cache';

interface ClaimsPageResponse {
  repository: {
    issues: {
      nodes: {
        number: number;
        title: string;
        url: string;
        comments: {
          nodes: {
            body: string;
            author: {login: string} | null;
            createdAt: string;
          }[];
        };
      }[];
      pageInfo: PageInfo;
    };
  };
}

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

interface IssueSearchResponse {
  search: {
    nodes: (RawIssue & {stateReason: string | null})[];
    pageInfo: PageInfo;
  };
}

interface PullRequestSearchResponse {
  search: {
    nodes: RawPullRequest[];
    pageInfo: PageInfo;
  };
}

interface GetDetailedRepoDataOptions {
  since?: string;
}

const PAGE_SIZE = 100;

/**
 * GitHub 라벨명을 내부 기여 카테고리로 정규화합니다.
 * @param label 정규화할 GitHub 라벨명
 * @returns 정규화된 기여 카테고리
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
 * 여러 라벨 중 기여 카테고리에 해당하는 첫 번째 라벨을 찾습니다.
 * @param labels GitHub 라벨명 목록
 * @returns 분류된 기여 카테고리
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
 * GitHub 라벨 노드 목록에서 라벨명만 추출합니다.
 * @param labels GitHub GraphQL 응답의 라벨 노드 목록
 * @returns 라벨명 문자열 배열
 */
const extractLabelNames = (labels: {nodes: {name: string}[]}): string[] =>
  labels.nodes.map(node => node.name).filter(name => Boolean(name));

/**
 * GitHub Issue 원본 데이터를 내부 IssueRecord 형식으로 변환합니다.
 * @param raw GitHub GraphQL 응답에서 가져온 Issue 데이터
 * @returns 내부에서 사용하는 IssueRecord 객체
 */
const toIssueRecord = (
  raw: RawIssue & {stateReason?: string | null},
): IssueRecord => {
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    state: raw.state,
    createdAt: raw.createdAt,
    closedAt: raw.closedAt,
    author: raw.author,
    labels: raw.labels,
    category: categorizeLabels(extractLabelNames(raw.labels)),
  };
};

/**
 * GitHub Pull Request 원본 데이터를 내부 PRRecord 형식으로 변환합니다.
 * @param raw GitHub GraphQL 응답에서 가져온 Pull Request 데이터
 * @returns 내부에서 사용하는 PRRecord 객체
 */
const toPrRecord = (raw: RawPullRequest): PRRecord => {
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    merged: raw.merged,
    mergedAt: raw.mergedAt,
    additions: raw.additions,
    deletions: raw.deletions,
    author: raw.author,
    labels: raw.labels,
    category: categorizeLabels(extractLabelNames(raw.labels)),
  };
};

/**
 * 번호를 기준으로 기존 캐시 데이터와 새로 조회한 데이터를 병합합니다.
 * @param cachedItems 캐시에 저장되어 있던 기존 항목 목록
 * @param updatedItems 새로 조회한 최신 항목 목록
 * @returns 번호 기준으로 병합된 항목 목록
 */
const mergeByNumber = <T extends {number: number}>(
  cachedItems: T[],
  updatedItems: T[],
): T[] => {
  const itemMap = new Map<number, T>();

  for (const item of cachedItems) {
    itemMap.set(item.number, item);
  }

  for (const item of updatedItems) {
    itemMap.set(item.number, item);
  }

  return [...itemMap.values()].sort((a, b) => b.number - a.number);
};

/**
 * 기여 카테고리별 개수를 나타내는 객체입니다.
 */
export interface CategoryCounts {
  feature: number;
  bug: number;
  doc: number;
  typo: number;
  none: number;
}

/**
 * 기여 기록 목록을 카테고리별로 집계합니다.
 * @param records 카테고리 정보가 포함된 기여 기록 목록
 * @returns 카테고리별 개수
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
 * GitHub GraphQL API를 사용하는 서비스 객체를 생성합니다.
 * @param token GitHub Personal Access Token
 * @returns 저장소 상세 데이터와 이슈 선점 현황을 조회하는 서비스 객체
 */
export const createGitHubService = (token: string, pageSize = PAGE_SIZE) => {
  const githubGraphQL = graphql.defaults({
    headers: {
      authorization: `token ${token}`,
    },
  });

  /**
   * 저장소의 유효한 이슈를 모두 조회합니다.
   * OPEN 상태이거나 완료 처리된 이슈만 수집합니다.
   * @param owner 저장소 소유자
   * @param repo 저장소 이름
   * @returns 유효한 이슈 목록
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
          {owner, repo, pageSize, cursor},
        );

      const connection: IssuePageResponse['repository']['issues'] =
        response.repository.issues;

      const validNodes = connection.nodes.filter(
        (node: RawIssue & {stateReason: string | null}) =>
          node.state === 'OPEN' || node.stateReason === 'COMPLETED',
      );

      issues.push(...validNodes.map(toIssueRecord));

      cursor = connection.pageInfo.endCursor;
      hasNextPage = connection.pageInfo.hasNextPage && cursor !== null;
    }

    return issues;
  };

  /**
   * 저장소의 병합된 Pull Request를 모두 조회합니다.
   * @param owner 저장소 소유자
   * @param repo 저장소 이름
   * @returns 병합된 Pull Request 목록
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
          {owner, repo, pageSize, cursor},
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
   * 지정한 시점 이후 변경된 유효 이슈를 조회합니다.
   * OPEN 상태이거나 완료 처리된 이슈만 수집합니다.
   * @param owner 저장소 소유자
   * @param repo 저장소 이름
   * @param since 변경 내역을 조회할 기준 시각
   * @returns 기준 시각 이후 변경된 유효 이슈 목록
   */
  const getUpdatedValidIssues = async (
    owner: string,
    repo: string,
    since: string,
  ): Promise<IssueRecord[]> => {
    const issues: IssueRecord[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const response: IssueSearchResponse =
        await githubGraphQL<IssueSearchResponse>(
          `
          query(
            $searchQuery: String!
            $pageSize: Int!
            $cursor: String
          ) {
            search(
              query: $searchQuery
              type: ISSUE
              first: $pageSize
              after: $cursor
            ) {
              nodes {
                ... on Issue {
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
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
          `,
          {
            searchQuery: `repo:${owner}/${repo} is:issue updated:>=${since}`,
            pageSize,
            cursor,
          },
        );

      const validNodes = response.search.nodes.filter(
        (node: RawIssue & {stateReason: string | null}) =>
          node.state === 'OPEN' || node.stateReason === 'COMPLETED',
      );

      issues.push(...validNodes.map(toIssueRecord));

      cursor = response.search.pageInfo.endCursor;
      hasNextPage = response.search.pageInfo.hasNextPage && cursor !== null;
    }

    return issues;
  };

  /**
   * 지정한 시점 이후 변경된 병합 Pull Request를 조회합니다.
   * @param owner 저장소 소유자
   * @param repo 저장소 이름
   * @param since 변경 내역을 조회할 기준 시각
   * @returns 기준 시각 이후 변경된 병합 Pull Request 목록
   */
  const getUpdatedMergedPullRequests = async (
    owner: string,
    repo: string,
    since: string,
  ): Promise<PRRecord[]> => {
    const prs: PRRecord[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const response: PullRequestSearchResponse =
        await githubGraphQL<PullRequestSearchResponse>(
          `
          query(
            $searchQuery: String!
            $pageSize: Int!
            $cursor: String
          ) {
            search(
              query: $searchQuery
              type: ISSUE
              first: $pageSize
              after: $cursor
            ) {
              nodes {
                ... on PullRequest {
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
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
          `,
          {
            searchQuery: `repo:${owner}/${repo} is:pr is:merged updated:>=${since}`,
            pageSize,
            cursor,
          },
        );

      prs.push(...response.search.nodes.map(toPrRecord));

      cursor = response.search.pageInfo.endCursor;
      hasNextPage = response.search.pageInfo.hasNextPage && cursor !== null;
    }

    return prs;
  };

  /**
   * 저장소의 이슈와 병합된 Pull Request 상세 데이터를 조회합니다.
   * 캐시가 있으면 마지막 분석 시점 이후의 변경분만 조회해 병합하고,
   * 캐시가 없으면 전체 데이터를 새로 수집합니다.
   * @param owner 저장소 소유자
   * @param repo 저장소 이름
   * @param useCache 캐시 사용 여부
   * @returns 저장소의 상세 기여 데이터
   */
  const getDetailedRepoData = async (
    owner: string,
    repo: string,
    useCache = true,
    options?: GetDetailedRepoDataOptions,
  ): Promise<DetailedRepoData> => {
    const analysisStartedAt = new Date().toISOString();
    const cached = await loadCache<DetailedRepoData>(owner, repo, !useCache);

    if (!cached) {
      const [issues, prs] = await Promise.all([
        getAllValidIssues(owner, repo),
        getAllMergedPullRequests(owner, repo),
      ]);

      const data: DetailedRepoData = {
        prs,
        issues,
      };

      await saveCache(owner, repo, data, analysisStartedAt);

      return data;
    }

    const since = options?.since ?? cached.lastAnalyzedAt;

    const [updatedIssues, updatedPrs] = await Promise.all([
      getUpdatedValidIssues(owner, repo, since),
      getUpdatedMergedPullRequests(owner, repo, since),
    ]);

    const data: DetailedRepoData = {
      prs: mergeByNumber(cached.data.prs, updatedPrs),
      issues: mergeByNumber(cached.data.issues, updatedIssues),
    };

    await saveCache(owner, repo, data, analysisStartedAt);

    return data;
  };

  /**
   * 열린 이슈와 최근 댓글을 조회하여 선점 키워드가 포함된 이슈를 분류합니다.
   * @param owner 저장소 소유자
   * @param repo 저장소 이름
   * @param keywords 선점 여부를 판단할 키워드 목록
   * @param repoPath 출력에 사용할 저장소 경로
   * @returns 선점된 이슈와 선점되지 않은 이슈 목록
   */
  const getRecentClaimsData = async (
    owner: string,
    repo: string,
    keywords: string[],
    repoPath: string,
  ): Promise<RepoClaims> => {
    const claimed: ClaimInfo[] = [];
    const unclaimed: ClaimInfo[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const response: ClaimsPageResponse =
        await githubGraphQL<ClaimsPageResponse>(
          `
        query($owner: String!, $repo: String!, $pageSize: Int!, $cursor: String) {
          repository(owner: $owner, name: $repo) {
            issues(first: $pageSize, after: $cursor, states: OPEN, orderBy: {field: CREATED_AT, direction: DESC}) {
              nodes {
                number
                title
                url
                comments(last: 10) {
                  nodes {
                    body
                    author { login }
                    createdAt
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
        `,
          {owner, repo, pageSize, cursor},
        );

      const connection = response.repository.issues;
      const nodes = connection.nodes;

      for (const node of nodes) {
        let matchedClaim: {
          claimer: string;
          keyword: string;
          createdAt: string;
        } | null = null;

        const comments = [...node.comments.nodes].reverse();

        for (const comment of comments) {
          const foundKeyword = keywords.find(k => comment.body.includes(k));
          if (foundKeyword) {
            matchedClaim = {
              claimer: comment.author?.login ?? 'unknown',
              keyword: foundKeyword,
              createdAt: comment.createdAt,
            };
            break;
          }
        }

        const info: ClaimInfo = {
          issueNumber: node.number,
          title: node.title,
          url: node.url,
          claimedBy: matchedClaim?.claimer ?? null,
          matchedKeyword: matchedClaim?.keyword ?? null,
          claimedAt: matchedClaim?.createdAt ?? null,
        };

        if (matchedClaim) {
          claimed.push(info);
        } else {
          unclaimed.push(info);
        }
      }

      cursor = connection.pageInfo.endCursor;
      hasNextPage = connection.pageInfo.hasNextPage && cursor !== null;
    }

    return {repoPath, claimed, unclaimed};
  };

  return {
    getDetailedRepoData,
    getRecentClaimsData,
  };
};
