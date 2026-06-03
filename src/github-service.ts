import {graphql} from '@octokit/graphql';

import type {
  ContributionLabel,
  DetailedRepoData,
  IssueRecord,
  PRRecord,
} from './types';

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

const PAGE_SIZE = 100;

export const normalizeLabel = (label: string): ContributionLabel => {
  const key = label.toLowerCase().replace(/[-_\s]/g, '');
  if (key === 'feat' || key === 'feature' || key === 'enhancement')
    return 'feature';
  if (key === 'bug') return 'bug';
  if (key === 'doc' || key === 'docs' || key === 'documentation') return 'doc';
  if (key === 'typo') return 'typo';
  return 'none';
};

export const categorizeLabels = (labels: string[]): ContributionLabel => {
  for (const label of labels) {
    const category = normalizeLabel(label);
    if (category !== 'none') {
      return category;
    }
  }

  return 'none';
};

const extractLabelNames = (
  labels: {nodes: {name: string}[]} | null,
): string[] => {
  if (!labels || !labels.nodes) return [];

  return labels.nodes.map(node => node.name).filter(name => Boolean(name));
};

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
            $query: String!
            $pageSize: Int!
            $cursor: String
          ) {
            search(
              query: $query
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
            query: `repo:${owner}/${repo} is:issue updated:>=${since}`,
            pageSize: PAGE_SIZE,
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
            $query: String!
            $pageSize: Int!
            $cursor: String
          ) {
            search(
              query: $query
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
            query: `repo:${owner}/${repo} is:pr is:merged updated:>=${since}`,
            pageSize: PAGE_SIZE,
            cursor,
          },
        );

      prs.push(...response.search.nodes.map(toPrRecord));

      cursor = response.search.pageInfo.endCursor;
      hasNextPage = response.search.pageInfo.hasNextPage && cursor !== null;
    }

    return prs;
  };

  const getDetailedRepoData = async (
    owner: string,
    repo: string,
    useCache = true,
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

    const [updatedIssues, updatedPrs] = await Promise.all([
      getUpdatedValidIssues(owner, repo, cached.lastAnalyzedAt),
      getUpdatedMergedPullRequests(owner, repo, cached.lastAnalyzedAt),
    ]);

    const data: DetailedRepoData = {
      prs: mergeByNumber(cached.data.prs, updatedPrs),
      issues: mergeByNumber(cached.data.issues, updatedIssues),
    };

    await saveCache(owner, repo, data, analysisStartedAt);

    return data;
  };

  return {
    getDetailedRepoData,
  };
};
