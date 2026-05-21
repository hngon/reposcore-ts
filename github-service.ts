import {graphql} from '@octokit/graphql';

import type {
  ContributionLabel,
  DetailedRepoData,
  IssueRecord,
  PRRecord,
} from './types';

import {loadCache, saveCache} from './cache';

export interface RepoStats {
  issues: number;
  pullRequests: number;
}

interface RepositoryStatsResponse {
  repository: {
    issues: {totalCount: number};
    pullRequests: {totalCount: number};
  };
}

interface RawAuthor {
  login: string;
}

interface RawLabel {
  name: string;
}

interface RawIssue {
  number: number;
  title: string;
  url: string;
  state: string;
  createdAt: string;
  closedAt: string | null;
  author: RawAuthor | null;
  labels: {nodes: RawLabel[]} | null;
}

interface RawPullRequest {
  number: number;
  title: string;
  url: string;
  merged: boolean;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  author: RawAuthor | null;
  labels: {nodes: RawLabel[]} | null;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface IssuePageResponse {
  repository: {
    issues: {
      nodes: RawIssue[];
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

// 라벨 문자열을 ContributionLabel 카테고리로 정규화합니다.
// 소문자 변환 후 하이픈/공백/언더스코어를 제거해 매칭합니다.
export const normalizeLabel = (label: string): ContributionLabel => {
  const key = label.toLowerCase().replace(/[-_\s]/g, '');
  if (key === 'feat' || key === 'feature') return 'feature';
  if (key === 'bug') return 'bug';
  if (key === 'doc' || key === 'docs' || key === 'documentation') return 'doc';
  if (key === 'typo') return 'typo';
  return 'none';
};

// 라벨 배열에서 첫 번째로 인식되는 ContributionLabel을 반환합니다.
// 인식 가능한 라벨이 없으면 'none'을 반환합니다.
export const categorizeLabels = (labels: string[]): ContributionLabel => {
  for (const label of labels) {
    const category = normalizeLabel(label);
    if (category !== 'none') {
      return category;
    }
  }
  return 'none';
};

const extractLabelNames = (labels: {nodes: RawLabel[]} | null): string[] => {
  if (!labels || !labels.nodes) return [];
  return labels.nodes.map(node => node.name).filter(name => Boolean(name));
};

const toIssueRecord = (raw: RawIssue): IssueRecord => {
  const labels = extractLabelNames(raw.labels);
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    labels,
    category: categorizeLabels(labels),
    state: raw.state,
    author: raw.author?.login,
    createdAt: raw.createdAt,
    closedAt: raw.closedAt ?? undefined,
  };
};

const toPrRecord = (raw: RawPullRequest): PRRecord => {
  const labels = extractLabelNames(raw.labels);
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    isMerged: raw.merged,
    labels,
    category: categorizeLabels(labels),
    additions: raw.additions,
    deletions: raw.deletions,
    mergedAt: raw.mergedAt ?? undefined,
    author: raw.author?.login,
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

export const createGitHubService = (token: string) => {
  const githubGraphQL = graphql.defaults({
    headers: {
      authorization: `token ${token}`,
    },
  });

  const getRepoStats = async (
    owner: string,
    repo: string,
  ): Promise<RepoStats> => {
    const result = await githubGraphQL<RepositoryStatsResponse>(
      `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          issues { totalCount }
          pullRequests { totalCount }
        }
      }
      `,
      {owner, repo},
    );

    return {
      issues: result.repository.issues.totalCount,
      pullRequests: result.repository.pullRequests.totalCount,
    };
  };

  const getAllClosedIssues = async (
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
              states: CLOSED
              orderBy: {field: CREATED_AT, direction: DESC}
            ) {
              nodes {
                number
                title
                url
                state
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

      issues.push(...connection.nodes.map(toIssueRecord));

      cursor = connection.pageInfo.endCursor;
      hasNextPage = connection.pageInfo.hasNextPage && cursor !== null;
    }

    return issues;
  };

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

  // closed 이슈와 merged PR을 각각 cursor 기반 페이지네이션으로 조회합니다.
  // useCache=true(기본)이면 .cache/<owner>_<repo>.json을 읽어 재사용하고,
  // 캐시가 없거나 useCache=false이면 API를 호출한 뒤 결과를 저장합니다.
  const getDetailedRepoData = async (
    owner: string,
    repo: string,
    useCache = true,
  ): Promise<DetailedRepoData> => {
    const cached = await loadCache<DetailedRepoData>(owner, repo, !useCache);
    if (cached) return cached.data;

    const [issues, prs] = await Promise.all([
      getAllClosedIssues(owner, repo),
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
    getRepoStats,
    getDetailedRepoData,
  };
};
