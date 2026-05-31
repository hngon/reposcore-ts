import type {DetailedRepoData} from '../types';

/**
 * 사용자별 이슈와 PR 기여 개수를 나타내는 점수 계산용 데이터입니다.
 */
export interface IssuePrData {
  userId: string;
  prFeatureBug: number;
  prDocs: number;
  prTypo: number;
  issueFeatureBug: number;
  issueDocs: number;
}

/**
 * 저장소별 점수 계산 데이터를 나타냅니다.
 */
export interface RepoData {
  owner: string;
  repo: string;
  scoreData: IssuePrData[];
}

/**
 * 사용자별 저장소 점수와 최종 합산 점수를 나타냅니다.
 */
export interface UserScore {
  userId: string;
  repoScores: RepoData[];
  totalScore: number;
}

/**
 * 저장소의 이슈와 PR 데이터를 기반으로 사용자별 기여 점수를 계산하는 클래스입니다.
 */
export class ScoreCalculator {
  private static readonly PR_FEATURE_BUG_WEIGHT = 3;
  private static readonly PR_DOCS_WEIGHT = 2;
  private static readonly PR_TYPO_WEIGHT = 1;
  private static readonly ISSUE_FEATURE_BUG_WEIGHT = 2;
  private static readonly ISSUE_DOCS_WEIGHT = 1;

  /**
   * 저장소의 이슈와 PR 데이터를 사용자별 점수 계산 데이터로 변환합니다.
   *
   * category가 'none'인 항목은 점수 산정 대상에서 제외하고,
   * 작성자가 없는 경우 사용자 ID를 'unknown'으로 처리합니다.
   *
   * @param repo 이슈와 PR 목록을 포함한 저장소 상세 데이터
   * @returns 사용자별 Issue/PR 집계 데이터 목록
   */
  static buildIssuePrData(repo: DetailedRepoData): IssuePrData[] {
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

    for (const issue of repo.issues) {
      if (issue.category === 'none') continue;
      const target = getOrCreate(issue.author?.login ?? 'unknown');
      if (issue.category === 'feature' || issue.category === 'bug') {
        target.issueFeatureBug += 1;
      } else if (issue.category === 'doc') {
        target.issueDocs += 1;
      }
    }

    for (const pr of repo.prs) {
      if (pr.category === 'none') continue;
      const target = getOrCreate(pr.author?.login ?? 'unknown');
      if (pr.category === 'feature' || pr.category === 'bug') {
        target.prFeatureBug += 1;
      } else if (pr.category === 'doc') {
        target.prDocs += 1;
      } else if (pr.category === 'typo') {
        target.prTypo += 1;
      }
    }

    return Array.from(bucket.values());
  }

  /**
   * 상세 저장소 데이터를 저장소별 점수 계산 데이터로 변환합니다.
   *
   * @param detailed GitHub에서 수집한 저장소 상세 데이터
   * @param owner 저장소 소유자 이름
   * @param repo 저장소 이름
   * @returns 저장소별 점수 계산 데이터
   */
  static calculateRepoData(
    detailed: DetailedRepoData,
    owner: string,
    repo: string,
  ): RepoData {
    return {
      owner,
      repo,
      scoreData: ScoreCalculator.buildIssuePrData(detailed),
    };
  }

  /**
   * 주어진 사용자 기여 데이터에서 점수 산정에 반영할 유효 PR 개수를 계산합니다.
   *
   * @param data 사용자별 이슈와 PR 기여 데이터
   * @returns 점수 산정에 반영되는 유효 PR 개수
   */
  private static calculateValidPrCount(data: IssuePrData): number {
    const pFb = data.prFeatureBug;
    const pDocsAndTypo = data.prDocs + data.prTypo;
    return pFb + Math.min(pDocsAndTypo, 3 * Math.max(pFb, 1));
  }

  /**
   * 사용자 기여 데이터와 유효 PR 개수를 기반으로 점수 산정에 반영할 유효 이슈 개수를 계산합니다.
   *
   * @param data 사용자별 이슈와 PR 기여 데이터
   * @param validPrCount 점수 산정에 반영되는 유효 PR 개수
   * @returns 점수 산정에 반영되는 유효 이슈 개수
   */
  private static calculateValidIssueCount(
    data: IssuePrData,
    validPrCount: number,
  ): number {
    const totalIssues = data.issueFeatureBug + data.issueDocs;
    return Math.min(totalIssues, 4 * validPrCount);
  }

  /**
   * 사용자별 기여 데이터를 기반으로 최종 기여 점수를 계산합니다.
   *
   * @param data 사용자별 이슈와 PR 기여 데이터
   * @returns 계산된 최종 기여 점수
   */
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

  /**
   * 여러 저장소의 점수 계산 데이터를 사용자별로 집계하고 최종 점수를 계산합니다.
   *
   * @param repos 저장소별 점수 계산 데이터 목록
   * @returns 사용자별 저장소 점수와 최종 합산 점수 목록
   */
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
