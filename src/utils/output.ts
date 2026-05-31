import {mkdir} from 'node:fs/promises';
import {countByCategory} from '../services/github-service';
import type {DetailedRepoData} from '../types';
import type {UserScore} from '../core/score-calculator';

const DEFAULT_OUTPUT_DIR = 'output';
const CSV_FILENAME = 'scores.csv';
const TXT_FILENAME = 'scores.txt';

export interface RepoSummary {
  repoPath: string;
  mergedPrFeatureBug: number;
  mergedPrDocs: number;
  mergedPrTypo: number;
  closedIssueFeatureBug: number;
  closedIssueDocs: number;
}

export interface OutputPaths {
  csv: string;
  txt: string;
}

/**
 * 출력 디렉토리와 서브 디렉토리 정보를 조합하여 최종 파일 저장 경로 객체를 생성합니다.
 * 향후 --output 옵션이 추가되어도 경로 조합 로직이 한곳에 모이도록 분리합니다.
 *
 * @param outputDir 기본 출력 디렉토리 명 (기본값: 'output')
 * @param subDir 추가적으로 지정할 하위 디렉토리 명 (선택 사항)
 * @returns 생성된 CSV 및 TXT 파일의 경로 정보를 담은 OutputPaths 객체
 */
export const getOutputPaths = (
  outputDir: string = DEFAULT_OUTPUT_DIR,
  subDir?: string,
): OutputPaths => {
  const targetDir = subDir ? `${outputDir}/${subDir}` : outputDir;
  return {
    csv: `${targetDir}/${CSV_FILENAME}`,
    txt: `${targetDir}/${TXT_FILENAME}`,
  };
};

/**
 * DetailedRepoData를 저장소별 기여 카테고리 요약 정보(RepoSummary)로 변환합니다.
 * TXT 파일에서 가독성 있는 저장소별 블록을 생성하는 데 사용됩니다.
 *
 * @param repoPath 대상 저장소의 경로 명 (예: 'owner/repo')
 * @param detailed 이슈와 PR 목록을 포함한 저장소 상세 데이터
 * @returns 카테고리별 기여 개수가 집계된 RepoSummary 객체
 */
export const summarizeRepo = (
  repoPath: string,
  detailed: DetailedRepoData,
): RepoSummary => {
  const prCounts = countByCategory(detailed.prs);
  const issueCounts = countByCategory(detailed.issues);
  return {
    repoPath,
    mergedPrFeatureBug: prCounts.feature + prCounts.bug,
    mergedPrDocs: prCounts.doc,
    mergedPrTypo: prCounts.typo,
    closedIssueFeatureBug: issueCounts.feature + issueCounts.bug,
    closedIssueDocs: issueCounts.doc,
  };
};

const USER_CSV_HEADERS = [
  'userId',
  'prFeatureBug',
  'prDocs',
  'prTypo',
  'issueFeatureBug',
  'issueDocs',
  'totalScore',
] as const;

/**
 * 전체 사용자 점수 목록을 받아 CSV 파일에 기록할 텍스트 문자열을 빌드합니다.
 *
 * @param userScores 각 사용자별 점수 및 상세 기여 데이터 배열
 * @returns CSV 형식으로 인코딩된 헤더와 데이터 문자열
 */
export const buildUserScoresCsv = (users: ReadonlyArray<UserScore>): string => {
  const rows = users.map(user => {
    let prFeatureBug = 0;
    let prDocs = 0;
    let prTypo = 0;
    let issueFeatureBug = 0;
    let issueDocs = 0;
    for (const repo of user.repoScores) {
      for (const data of repo.scoreData) {
        prFeatureBug += data.prFeatureBug;
        prDocs += data.prDocs;
        prTypo += data.prTypo;
        issueFeatureBug += data.issueFeatureBug;
        issueDocs += data.issueDocs;
      }
    }
    return [
      user.userId,
      prFeatureBug,
      prDocs,
      prTypo,
      issueFeatureBug,
      issueDocs,
      user.totalScore,
    ].join(',');
  });
  return [USER_CSV_HEADERS.join(','), ...rows].join('\n') + '\n';
};

// 저장소별 카테고리 요약을 사람이 읽기 좋은 TXT 블록으로 만듭니다.
export const buildRepoSummariesTxt = (
  summaries: ReadonlyArray<RepoSummary>,
): string => {
  const blocks = summaries.map(s =>
    [
      `[${s.repoPath}]`,
      `Merged PRs - feature/bug: ${s.mergedPrFeatureBug}, docs: ${s.mergedPrDocs}, typo: ${s.mergedPrTypo}`,
      `Closed Issues - feature/bug: ${s.closedIssueFeatureBug}, docs: ${s.closedIssueDocs}`,
    ].join('\n'),
  );
  return blocks.join('\n\n') + '\n';
};

/**
 * 저장소 요약 데이터 정보와 전체 사용자 점수 데이터를 가독성 있는 텍스트(TXT) 포맷 문자열로 빌드합니다.
 *
 * @param repos 저장소별 요약 기여 데이터 정보 배열
 * @param userScores 전체 사용자별 최종 합산 점수 및 상세 기여 데이터 배열
 * @returns 텍스트(TXT) 파일용 보고서 문자열
 */
export const buildUserScoresTxt = (users: ReadonlyArray<UserScore>): string => {
  const lines = users.map(user => {
    let prFeatureBug = 0;
    let prDocs = 0;
    let prTypo = 0;
    let issueFeatureBug = 0;
    let issueDocs = 0;
    for (const repo of user.repoScores) {
      for (const data of repo.scoreData) {
        prFeatureBug += data.prFeatureBug;
        prDocs += data.prDocs;
        prTypo += data.prTypo;
        issueFeatureBug += data.issueFeatureBug;
        issueDocs += data.issueDocs;
      }
    }
    return `- ${user.userId}: totalScore=${user.totalScore}, PR(feature/bug)=${prFeatureBug}, PR(docs)=${prDocs}, PR(typo)=${prTypo}, Issue(feature/bug)=${issueFeatureBug}, Issue(docs)=${issueDocs}`;
  });

  return ['User Scores', ...lines].join('\n') + '\n';
};

export interface ScoreOutputData {
  userScores: ReadonlyArray<UserScore>;
  repoSummaries: ReadonlyArray<RepoSummary>;
}

/**
 * 최종 결과 데이터를 기반으로 파일 시스템에 출력 파일을 작성합니다.
 * CSV는 항상 생성하며, format 인자가 'txt'인 경우 TXT 파일도 함께 생성합니다.
 * reposcore-cs와 동일한 사양을 따릅니다.
 *
 * @param format 생성할 파일의 포맷 형식 ('csv' 또는 'txt')
 * @param data 최종 출력할 저장소 요약 및 사용자 점수 데이터 정보 객체
 * @param outputDir 파일이 저장될 기본 출력 디렉토리 경로 (기본값: DEFAULT_OUTPUT_DIR)
 * @param subDir 추가적으로 생성할 하위 디렉토리 명 (선택 사항)
 * @returns 작성이 완료된 파일들의 경로 정보를 담은 Promise 객체
 */
export const writeOutputFiles = async (
  format: 'csv' | 'txt',
  data: ScoreOutputData,
  outputDir: string = DEFAULT_OUTPUT_DIR,
  subDir?: string,
): Promise<OutputPaths | {csv: string}> => {
  const paths = getOutputPaths(outputDir, subDir);

  const targetDir = subDir ? `${outputDir}/${subDir}` : outputDir;
  await mkdir(targetDir, {recursive: true});

  await Bun.write(paths.csv, buildUserScoresCsv(data.userScores));

  if (format === 'txt') {
    // 💡 기존 저장소 요약 하단에 사용자별 점수 요약본을 개행('\n')으로 결합하여 저장합니다.
    const repoSummariesTxt = buildRepoSummariesTxt(data.repoSummaries);
    const userScoresTxt = buildUserScoresTxt(data.userScores);

    await Bun.write(paths.txt, repoSummariesTxt + '\n' + userScoresTxt);
    return paths;
  }

  return {csv: paths.csv};
};
