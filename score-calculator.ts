export type ContributionKind = 'feature' | 'bug' | 'doc' | 'typo';

export interface IssueInfo {
  userId: string;
  kind: ContributionKind;
  isClosed: boolean;
  title: string;
  url: string;
}

export interface PrInfo {
  userId: string;
  kind: ContributionKind;
  isMerged: boolean;
  title: string;
  url: string;
}

export interface RepoStats {
  owner: string;
  repo: string;
  issues: IssueInfo[];
  pullRequests: PrInfo[];
}

export interface IssuePrData {
  userId: string;
  prFeatureBug: number;
  prDocs: number;
  prTypo: number;
  issueFeatureBug: number;
  issueDocs: number;
}

export interface RepoData {
  owner: string;
  repo: string;
  scoreData: IssuePrData[];
}

export interface UserScore {
  userId: string;
  repoScores: RepoData[];
  totalScore: number;
}

export class ScoreCalculator {
  private static readonly PR_FEATURE_BUG_WEIGHT = 3;
  private static readonly PR_DOCS_WEIGHT = 2;
  private static readonly PR_TYPO_WEIGHT = 1;
  private static readonly ISSUE_FEATURE_BUG_WEIGHT = 2;
  private static readonly ISSUE_DOCS_WEIGHT = 1;

  // 저장소의 이슈와 PR을 사용자별 IssuePrData 리스트로 변환합니다.
  static buildIssuePrData(repoStats: RepoStats): IssuePrData[] {
    const bucket = new Map<string, IssuePrData>();

    const getOrCreate = (userId: string): IssuePrData => {
      const existing = bucket.get(userId);
      if (existing) {
        return existing;
      }

      const created: IssuePrData = {
        userId,
        prFeatureBug: 0,
        prDocs: 0,
        prTypo: 0,
        issueFeatureBug: 0,
        issueDocs: 0,
      };
      bucket.set(userId, created);
      return created;
    };

    for (const issue of repoStats.issues) {
      const target = getOrCreate(issue.userId);
      if (issue.kind === 'feature' || issue.kind === 'bug') {
        target.issueFeatureBug += 1;
      } else if (issue.kind === 'doc') {
        target.issueDocs += 1;
      }
    }

    for (const pr of repoStats.pullRequests) {
      const target = getOrCreate(pr.userId);
      if (pr.kind === 'feature' || pr.kind === 'bug') {
        target.prFeatureBug += 1;
      } else if (pr.kind === 'doc') {
        target.prDocs += 1;
      } else if (pr.kind === 'typo') {
        target.prTypo += 1;
      }
    }

    return Array.from(bucket.values());
  }

  // RepoStats를 RepoData로 변환하여 저장소별 scoreData를 만듭니다.
  static calculateRepoData(repoStats: RepoStats): RepoData {
    return {
      owner: repoStats.owner,
      repo: repoStats.repo,
      scoreData: ScoreCalculator.buildIssuePrData(repoStats),
    };
  }

  // 주어진 IssuePrData에서 유효 PR 개수를 계산합니다.
  private static calculateValidPrCount(data: IssuePrData): number {
    const pFb = data.prFeatureBug;
    const pDocsAndTypo = data.prDocs + data.prTypo;
    return pFb + Math.min(pDocsAndTypo, 3 * Math.max(pFb, 1));
  }

  // 주어진 IssuePrData와 유효 PR 개수를 기반으로 유효 이슈 개수를 계산합니다.
  private static calculateValidIssueCount(
    data: IssuePrData,
    validPrCount: number,
  ): number {
    const totalIssues = data.issueFeatureBug + data.issueDocs;
    return Math.min(totalIssues, 4 * validPrCount);
  }

  // IssuePrData를 받아 최종 기여 점수를 계산합니다.
  private static calculateFinalScore(data: IssuePrData): number {
    const validPrCount = ScoreCalculator.calculateValidPrCount(data);
    const validIssueCount = ScoreCalculator.calculateValidIssueCount(
      data,
      validPrCount,
    );

    const acceptedPrFeatureBug = Math.min(data.prFeatureBug, validPrCount);
    const acceptedPrDocs = Math.min(
      data.prDocs,
      validPrCount - acceptedPrFeatureBug,
    );
    const acceptedPrTypo = validPrCount - acceptedPrFeatureBug - acceptedPrDocs;

    const acceptedIssueFeatureBug = Math.min(
      data.issueFeatureBug,
      validIssueCount,
    );
    const acceptedIssueDocs = validIssueCount - acceptedIssueFeatureBug;

    return (
      acceptedPrFeatureBug * ScoreCalculator.PR_FEATURE_BUG_WEIGHT +
      acceptedPrDocs * ScoreCalculator.PR_DOCS_WEIGHT +
      acceptedPrTypo * ScoreCalculator.PR_TYPO_WEIGHT +
      acceptedIssueFeatureBug * ScoreCalculator.ISSUE_FEATURE_BUG_WEIGHT +
      acceptedIssueDocs * ScoreCalculator.ISSUE_DOCS_WEIGHT
    );
  }

  // 여러 저장소 RepoData를 받아 사용자별 점수를 집계합니다.
  static calculateUserScores(repos: RepoData[]): UserScore[] {
    const byUser = new Map<string, RepoData[]>();

    for (const repo of repos) {
      for (const scoreData of repo.scoreData) {
        const userRepos = byUser.get(scoreData.userId) ?? [];
        const existing = userRepos.find(
          item => item.owner === repo.owner && item.repo === repo.repo,
        );

        if (existing) {
          existing.scoreData.push(scoreData);
        } else {
          userRepos.push({
            owner: repo.owner,
            repo: repo.repo,
            scoreData: [scoreData],
          });
        }

        byUser.set(scoreData.userId, userRepos);
      }
    }

    return Array.from(byUser.entries()).map(([userId, repoScores]) => {
      const aggregated = repoScores
        .flatMap(repo => repo.scoreData)
        .reduce(
          (acc, current) => ({
            userId: acc.userId || current.userId,
            prFeatureBug: acc.prFeatureBug + current.prFeatureBug,
            prDocs: acc.prDocs + current.prDocs,
            prTypo: acc.prTypo + current.prTypo,
            issueFeatureBug: acc.issueFeatureBug + current.issueFeatureBug,
            issueDocs: acc.issueDocs + current.issueDocs,
          }),
          {
            userId,
            prFeatureBug: 0,
            prDocs: 0,
            prTypo: 0,
            issueFeatureBug: 0,
            issueDocs: 0,
          } as IssuePrData,
        );

      return {
        userId,
        repoScores,
        totalScore: ScoreCalculator.calculateFinalScore(aggregated),
      };
    });
  }
}
