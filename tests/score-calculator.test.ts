import {describe, test, expect} from 'bun:test';
import {ScoreCalculator, type RepoData} from '../src/core/score-calculator';
import type {DetailedRepoData} from '../src/types';

/**
 * ScoreCalculator 클래스의 기능에 대한 단위 테스트입니다.
 */
describe('ScoreCalculator 단위 테스트', () => {
  /**
   * 저장소 상세 데이터(DetailedRepoData)를 기반으로 사용자별 점수 산출용 중간 데이터(IssuePrData)를
   * 올바르게 구축하는지 검증합니다.
   */
  describe('buildIssuePrData() 데이터 매핑 규칙', () => {
    /**
     * Feature, Bug, Doc, Typo 라벨을 가진 PR과 이슈들이 각각 올바르게 카운트되는지,
     * 그리고 라벨이 없거나 기타 라벨인 경우('none') 점수 산정에서 완전히 제외되는지 검증합니다.
     */
    test('각 기여 카테고리별로 개수가 올바르게 분류되고 none 항목은 완전히 제외되어야 한다', () => {
      // 테스트 의도: 모든 종류의 유효한 카테고리(feature, bug, doc, typo)와
      // 무시되어야 할 'none' 카테고리를 혼합 구성하여 정상적으로 필터링 및 카운트되는지 확인합니다.
      const mockDetailedData: DetailedRepoData = {
        prs: [
          {
            number: 1,
            title: 'feat: 기능 추가',
            url: '',
            merged: true,
            mergedAt: null,
            additions: 0,
            deletions: 0,
            labels: {nodes: []},
            category: 'feature',
            author: {login: 'contributor1'},
          },
          {
            number: 2,
            title: 'fix: 버그 수정',
            url: '',
            merged: true,
            mergedAt: null,
            additions: 0,
            deletions: 0,
            labels: {nodes: []},
            category: 'bug',
            author: {login: 'contributor1'},
          },
          {
            number: 3,
            title: 'docs: 문서 수정',
            url: '',
            merged: true,
            mergedAt: null,
            additions: 0,
            deletions: 0,
            labels: {nodes: []},
            category: 'doc',
            author: {login: 'contributor1'},
          },
          {
            number: 4,
            title: 'typo: 오타 수정',
            url: '',
            merged: true,
            mergedAt: null,
            additions: 0,
            deletions: 0,
            labels: {nodes: []},
            category: 'typo',
            author: {login: 'contributor1'},
          },
          {
            number: 5,
            title: '기타 라벨 없음',
            url: '',
            merged: true,
            mergedAt: null,
            additions: 0,
            deletions: 0,
            labels: {nodes: []},
            category: 'none',
            author: {login: 'contributor1'},
          },
        ],
        issues: [
          {
            number: 6,
            title: '이슈 1',
            url: '',
            labels: {nodes: []},
            category: 'feature',
            state: 'closed',
            createdAt: '',
            closedAt: null,
            author: {login: 'contributor1'},
          },
          {
            number: 7,
            title: '이슈 2',
            url: '',
            labels: {nodes: []},
            category: 'bug',
            state: 'closed',
            createdAt: '',
            closedAt: null,
            author: {login: 'contributor1'},
          },
          {
            number: 8,
            title: '이슈 3',
            url: '',
            labels: {nodes: []},
            category: 'doc',
            state: 'closed',
            createdAt: '',
            closedAt: null,
            author: {login: 'contributor1'},
          },
          {
            number: 9,
            title: '무시할 이슈',
            url: '',
            labels: {nodes: []},
            category: 'none',
            state: 'closed',
            createdAt: '',
            closedAt: null,
            author: {login: 'contributor1'},
          },
        ],
      };

      // 복잡한 테스트 로직 인라인 주석:
      // 저장소 데이터를 기반으로 사용자별 중간 집계 데이터(IssuePrData)를 생성합니다.
      const result = ScoreCalculator.buildIssuePrData(mockDetailedData);

      expect(result).toHaveLength(1);

      const res = result[0]!;
      expect(res.userId).toBe('contributor1');
      // 기능(feature) 1개 + 버그(bug) 1개 = 2개
      expect(res.prFeatureBug).toBe(2);
      expect(res.prDocs).toBe(1);
      expect(res.prTypo).toBe(1);
      // 이슈 기능(feature) 1개 + 버그(bug) 1개 = 2개
      expect(res.issueFeatureBug).toBe(2);
      expect(res.issueDocs).toBe(1);
    });

    /**
     * PR이나 이슈에 작성자(author) 데이터가 없는 경우, 사용자 ID를 'unknown'으로 임의 지정하여
     * 누락 없이 데이터에 반영하는지 검증합니다.
     */
    test("작성자(author) 정보가 없는 경우 'unknown'으로 바인딩되어야 한다", () => {
      // 테스트 의도: GitHub 계정을 삭제했거나 API 응답에서 author 객체가 누락된 예외 상황을 모사합니다.
      const mockDetailedData: DetailedRepoData = {
        prs: [
          {
            number: 1,
            title: '탈퇴한 유저의 PR',
            url: '',
            merged: true,
            mergedAt: null,
            additions: 0,
            deletions: 0,
            labels: {nodes: []},
            category: 'feature',
            author: null,
          },
        ],
        issues: [],
      };

      const result = ScoreCalculator.buildIssuePrData(mockDetailedData);

      expect(result[0]!.userId).toBe('unknown');
    });
  });

  /**
   * 산출된 사용자별 데이터(IssuePrData)를 바탕으로 각 항목별 가중치 적용 및
   * 어뷰징 방지용 상한선(Capping) 제한 규칙이 정상적으로 동작하는지 검증합니다.
   */
  describe('최종 점수(totalScore) 및 제한 규칙 계산', () => {
    /**
     * 단일 RepoData에 대한 점수 계산 헬퍼 함수입니다.
     *
     * @param repoData 점수를 계산할 대상 저장소 데이터
     * @returns 단일 사용자에 대한 최종 합산 점수 (totalScore)
     */
    const getSingleUserScore = (repoData: RepoData): number => {
      const userScores = ScoreCalculator.calculateUserScores([repoData]);
      return userScores[0]!.totalScore;
    };

    /**
     * PR 및 이슈 개수가 어뷰징 제한 기준 미만일 때,
     * 각 카테고리별 기본 가중치가 정상적으로 곱해져 점수가 산출되는지 검증합니다.
     */
    test('기본 가중치가 정상적으로 적용되는지 검증 (PR 및 이슈 조건이 제한선 미만일 때)', () => {
      // 테스트 의도: 어뷰징 상한선(캡핑)에 걸리지 않는 소량의 기여 데이터를 모사하여
      // 각 카테고리별 기본 가중치(PR Feature/Bug: 3, PR Docs: 2 등)가 그대로 합산되는지 확인합니다.
      const repoData: RepoData = {
        owner: 'test-owner',
        repo: 'test-repo',
        scoreData: [
          {
            userId: 'user1',
            prFeatureBug: 1,
            prDocs: 1,
            prTypo: 1,
            issueFeatureBug: 1,
            issueDocs: 1,
          },
        ],
      };
      // 계산식: (1 * 3) + (1 * 2) + (1 * 1) + (1 * 2) + (1 * 1) = 9점
      expect(getSingleUserScore(repoData)).toBe(9);
    });

    /**
     * 문서(Docs) 및 오타(Typo) 수정 PR의 점수 인정 개수가
     * 기능(Feature) 및 버그(Bug) 수정 PR 개수에서 파생된 한도 내에서만 제한적으로 반영되는지 검증합니다.
     */
    test('Docs/Typo PR 제한 규칙: Feature/Bug PR 개수 기반 인정 한도를 초과하면 상한선까지만 점수가 인정되어야 한다', () => {
      // 테스트 의도: Feature/Bug PR이 0개일 때, Docs/Typo PR 인정 한도(최대 3개)를 초과하는 데이터를 구성합니다.
      const repoData: RepoData = {
        owner: 'test-owner',
        repo: 'test-repo',
        scoreData: [
          {
            userId: 'user2',
            prFeatureBug: 0,
            prDocs: 5,
            prTypo: 0,
            issueFeatureBug: 0,
            issueDocs: 0,
          },
        ],
      };
      // 인정 한도(3개) 초과 시: 3개까지만 점수에 반영됨 (3 * 2점 = 6점)
      expect(getSingleUserScore(repoData)).toBe(6);
    });

    /**
     * 반영된 유효 PR의 총 개수를 기반으로, 이슈 인정 개수가 (유효 PR 수 * 4)로
     * 제한되는 어뷰징 방지 규칙이 동작하는지 검증합니다.
     */
    test('Issue 인정 개수 제한 규칙: 유효 PR 총합 개수의 4배를 초과한 이슈는 점수 산정에서 누락되어야 한다', () => {
      // 테스트 의도: 유효 PR이 1개일 때, 이슈 인정 한도(1 * 4 = 4개)를 초과하도록 6개의 이슈를 부여합니다.
      const repoData: RepoData = {
        owner: 'test-owner',
        repo: 'test-repo',
        scoreData: [
          {
            userId: 'user3',
            prFeatureBug: 1,
            prDocs: 0,
            prTypo: 0,
            issueFeatureBug: 6,
            issueDocs: 0,
          },
        ],
      };
      // PR(1 * 3점) + Issue 4개 인정(4 * 2점) = 11점 (초과된 2개의 이슈는 무시됨)
      expect(getSingleUserScore(repoData)).toBe(11);
    });

    /**
     * 코드 기여(PR) 없이 이슈만 생성하여 점수를 올리려는 행위를 방지하기 위해,
     * PR이 없는 경우 이슈 기여 점수도 함께 0점 처리되는 규칙을 검증합니다.
     */
    test('PR이 아예 없고 Issue만 존재하는 사용자는 어뷰징 방지 캡핑에 의해 0점 처리되어야 한다', () => {
      // 테스트 의도: 코드 기여(PR) 없이 이슈 스패밍을 통해 점수를 얻는 어뷰징 행위를 방지하기 위한 데이터를 모사합니다.
      const repoData: RepoData = {
        owner: 'test-owner',
        repo: 'test-repo',
        scoreData: [
          {
            userId: 'user4',
            prFeatureBug: 0,
            prDocs: 0,
            prTypo: 0,
            issueFeatureBug: 5,
            issueDocs: 5,
          },
        ],
      };
      // 유효 PR이 0개이므로, 이슈 인정 한도(0 * 4 = 0개) 역시 0이 되어 총 0점 처리
      expect(getSingleUserScore(repoData)).toBe(0);
    });
  });

  /**
   * 둘 이상의 저장소를 분석할 때 각 저장소에 흩어진 사용자 기여 기록을
   * 통합하여 올바르게 최종 점수로 환산하는지 검증합니다.
   */
  describe('calculateUserScores() 다중 저장소 합산 규칙', () => {
    /**
     * 동일한 유저가 여러 저장소에 기여한 기록이 있을 때, 먼저 전체 기여 횟수가 합산된 후
     * 최종 점수 캡핑(상한선) 규칙이 전체 통합본을 기준으로 정상적으로 적용되는지 검증합니다.
     */
    test('동일한 사용자가 여러 저장소에 기여했을 때 데이터 카운트가 합산된 후 최종 점수 캡핑 규칙이 먹혀야 한다', () => {
      // 테스트 의도: 'global-dev' 유저가 두 개의 다른 저장소(repo-android, repo-ios)에 기여한 상황을 모사합니다.
      const repoA: RepoData = {
        owner: 'org',
        repo: 'repo-android',
        scoreData: [
          {
            userId: 'global-dev',
            prFeatureBug: 1,
            prDocs: 0,
            prTypo: 0,
            issueFeatureBug: 2,
            issueDocs: 0,
          },
        ],
      };

      const repoB: RepoData = {
        owner: 'org',
        repo: 'repo-ios',
        scoreData: [
          {
            userId: 'global-dev',
            prFeatureBug: 1,
            prDocs: 0,
            prTypo: 0,
            issueFeatureBug: 3,
            issueDocs: 0,
          },
        ],
      };

      const finalScores = ScoreCalculator.calculateUserScores([repoA, repoB]);

      expect(finalScores).toHaveLength(1);

      const finalScore = finalScores[0]!;
      expect(finalScore.userId).toBe('global-dev');
      // 두 저장소의 데이터 합산: PR 2개, Issue 5개.
      // Issue 인정 한도는 2 * 4 = 8개이므로 Issue 5개 모두 인정됨. -> (2 * 3점) + (5 * 2점) = 16점
      expect(finalScore.totalScore).toBe(16);
      expect(finalScore.repoScores).toHaveLength(2);
    });

    /**
     * 여러 저장소의 통합 데이터 내에 여러 유저가 존재할 때,
     * 다른 사람의 데이터와 섞이지 않고 유저별로 각각 독립적으로 합산되는지 검증합니다.
     */
    test('서로 다른 사용자의 데이터는 합산되지 않고 고유한 로우(Row)로 유지되어야 한다', () => {
      // 테스트 의도: 한 저장소 내에 여러 유저(alpha, beta)가 기여했을 때, 각각의 점수가 섞이지 않고 독립적으로 계산되는지 검증합니다.
      const repoData: RepoData = {
        owner: 'org',
        repo: 'main-repo',
        scoreData: [
          {
            userId: 'alpha',
            prFeatureBug: 1,
            prDocs: 0,
            prTypo: 0,
            issueFeatureBug: 0,
            issueDocs: 0,
          },
          {
            userId: 'beta',
            prFeatureBug: 2,
            prDocs: 0,
            prTypo: 0,
            issueFeatureBug: 0,
            issueDocs: 0,
          },
        ],
      };

      const finalScores = ScoreCalculator.calculateUserScores([repoData]);
      expect(finalScores).toHaveLength(2);

      const alphaUser = finalScores.find(u => u.userId === 'alpha');
      const betaUser = finalScores.find(u => u.userId === 'beta');

      // alpha: 1 * 3 = 3점, beta: 2 * 3 = 6점
      expect(alphaUser!.totalScore).toBe(3);
      expect(betaUser!.totalScore).toBe(6);
    });
  });
});
