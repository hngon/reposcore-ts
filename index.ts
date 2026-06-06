import {cac} from 'cac';
import pkg from './package.json' with {type: 'json'};

import {createGitHubService} from './src/github-service';
import {ScoreCalculator, type RepoData} from './src/score-calculator';
import {
  summarizeRepo,
  writeOutputFiles,
  supportedFormats,
  type SupportedFormat,
  type RepoSummary,
  printClaims,
} from './src/output';
import {
  sortUserScores,
  supportedSortBys,
  supportedSortOrders,
  type SupportedSortBy,
  type SupportedSortOrder,
} from './src/sort';
import {type FullGitHubService} from './src/types';

const cli = cac('reposcore-ts');
cli.version(pkg.version);

function parseRepoPath(repoPath: string) {
  const parts = repoPath.split('/');

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  return {
    owner: parts[0],
    repoName: parts[1],
  };
}

cli
  .command('[...repos]', '대상 저장소 목록 (예: owner/repo1 owner/repo2)')
  .option('--token <token>', 'GitHub Personal Access Token', {
    default: '$GITHUB_TOKEN',
  })
  .option('--format <format>', '출력 형식 (csv, txt, html)', {
    default: 'csv',
  })
  .option('--output-dir <path>', '결과 파일을 저장할 디렉터리', {
    default: 'output',
  })
  .option('--no-cache', '캐시를 무시하고 GitHub API를 새로 호출합니다')
  .option('--sort-by <field>', '정렬 기준 (score, id)', {
    default: 'score',
  })
  .option('--sort-order <order>', '정렬 방식 (asc, desc)', {
    default: 'desc',
  })
  .option('--claims', '최근 이슈 선점 현황을 조회합니다')
  .option('--keywords [items]', '이슈 선점 키워드 목록(쉼표 구분)', {
    default: "제가 하겠습니다,진행하겠습니다,할게요,I'll take this",
  })
  .action(
    async (
      repos: string[],
      options: {
        token?: string;
        format: string;
        cache: boolean;
        outputDir?: string;
        sortBy: string;
        sortOrder: string;
        claims?: boolean;
        keywords?: string;
      },
    ) => {
      const token =
        options.token === '$GITHUB_TOKEN'
          ? Bun.env.GITHUB_TOKEN || ''
          : options.token || '';
      const formats = String(options.format || 'csv')
        .toLowerCase()
        .split(',')
        .map(format => format.trim())
        .filter(Boolean);
      const useCache = options.cache; // --no-cache 전달 시 false
      const outputDir = options.outputDir || 'output';
      const sortBy = String(options.sortBy || 'score').toLowerCase();
      const sortOrder = String(options.sortOrder || 'desc').toLowerCase();
      const errors: string[] = [];

      const isClaimsMode = !!options.claims;
      const DEFAULT_KEYWORDS = [
        '제가 하겠습니다',
        '진행하겠습니다',
        '할게요',
        "I'll take this",
      ];

      const claimKeywords =
        typeof options.keywords === 'string'
          ? options.keywords
              .split(',')
              .map(k => k.trim())
              .filter(Boolean)
          : DEFAULT_KEYWORDS;

      const parsedRepos: {
        repoPath: string;
        owner: string;
        repoName: string;
      }[] = [];

      if (!token) {
        errors.push(
          '오류: GitHub 토큰이 필요합니다. --token 옵션 또는 GITHUB_TOKEN 환경 변수를 설정하세요.',
        );
      }

      const invalidFormats = formats.filter(
        format => !supportedFormats.includes(format as SupportedFormat),
      );

      if (invalidFormats.length > 0) {
        errors.push(
          `오류: 지원하지 않는 출력 형식 '${invalidFormats.join(', ')}'입니다. csv, txt 또는 html을 입력하세요.`,
        );
      }

      if (!supportedSortBys.includes(sortBy as SupportedSortBy)) {
        errors.push(
          `오류: 지원하지 않는 정렬 기준 '${options.sortBy}'입니다. score 또는 id를 입력하세요.`,
        );
      }

      if (!supportedSortOrders.includes(sortOrder as SupportedSortOrder)) {
        errors.push(
          `오류: 지원하지 않는 정렬 방식 '${options.sortOrder}'입니다. asc 또는 desc를 입력하세요.`,
        );
      }

      if (repos.length === 0) {
        errors.push(
          '오류: 최소 하나 이상의 저장소(owner/repo)를 입력해야 합니다.',
        );
      }

      for (const repoPath of repos) {
        const parsedRepo = parseRepoPath(repoPath);

        if (!parsedRepo) {
          errors.push(`오류: '${repoPath}'는 'owner/repo' 형식이 아닙니다.`);
          continue;
        }

        parsedRepos.push({
          repoPath,
          owner: parsedRepo.owner,
          repoName: parsedRepo.repoName,
        });
      }

      if (errors.length > 0) {
        for (const error of errors) {
          console.error(error);
        }

        cli.outputHelp();
        process.exit(1);
      }

      const githubService = createGitHubService(token) as FullGitHubService;

      if (isClaimsMode) {
        for (const {repoPath, owner, repoName} of parsedRepos) {
          try {
            const claims = await githubService.getRecentClaimsData(
              owner,
              repoName,
              claimKeywords,
              repoPath,
            );
            printClaims(claims);
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(
              `오류: '${repoPath}'의 선점 현황을 조회할 수 없습니다. (${msg})`,
            );
          }
        }
        return;
      }

      console.log(`형식: ${formats.join(', ')}`);
      console.log(`저장소: ${repos.join(', ')}`);

      const repoDataList: RepoData[] = [];
      const repoSummaries: RepoSummary[] = [];

      for (const {repoPath, owner, repoName} of parsedRepos) {
        try {
          const detailed = await githubService.getDetailedRepoData(
            owner,
            repoName,
            useCache,
          );

          const repoData = ScoreCalculator.calculateRepoData(
            detailed,
            owner,
            repoName,
          );
          const repoSummary = summarizeRepo(repoPath, detailed);

          repoDataList.push(repoData);
          repoSummaries.push(repoSummary);

          const singleUserScores = sortUserScores(
            ScoreCalculator.calculateUserScores([repoData]),
            sortBy as SupportedSortBy,
            sortOrder as SupportedSortOrder,
          );

          const subDir = `${owner}-${repoName}`;
          const written = await writeOutputFiles(
            formats as SupportedFormat[],
            {
              userScores: singleUserScores,
              repoSummaries: [repoSummary],
            },
            outputDir,
            subDir,
          );
          console.log(`[${repoPath}] CSV 저장: ${written.csv}`);
          if (written.txt) {
            console.log(`[${repoPath}] TXT 저장: ${written.txt}`);
          }
          if (written.html) {
            console.log(`[${repoPath}] HTML 저장: ${written.html}`);
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          console.error(`오류: '${repoPath}'의 데이터를 가져올 수 없습니다.`);
          console.error(`상세 원인: ${errorMessage}`);
          process.exit(1);
        }
      }

      const userScores = sortUserScores(
        ScoreCalculator.calculateUserScores(repoDataList),
        sortBy as SupportedSortBy,
        sortOrder as SupportedSortOrder,
      );

      const written = await writeOutputFiles(
        formats as SupportedFormat[],
        {
          userScores,
          repoSummaries,
        },
        outputDir,
      );
      console.log(`[합산] CSV 저장: ${written.csv}`);
      if (written.txt) {
        console.log(`[합산] TXT 저장: ${written.txt}`);
      }
      if (written.html) {
        console.log(`[합산] HTML 저장: ${written.html}`);
      }
    },
  );

cli.help();
cli.parse();
