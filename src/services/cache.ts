const CACHE_DIR = '.cache';

/**
 * 저장소별 분석 캐시 데이터 구조. JSON 파일로 직렬화되어 저장됩니다.
 *
 * @template T 캐시에 저장되는 실제 데이터의 타입
 */
export interface RepoCache<T> {
  /** `owner/repo` 형식의 저장소 식별자. */
  repository: string;
  /** 마지막으로 분석을 수행한 시각 (ISO 8601 형식). */
  lastAnalyzedAt: string; // ISO 8601
  /** 캐시된 분석 결과 데이터. */
  data: T;
}

/**
 * 저장소 소유자와 이름을 기반으로 캐시 파일의 경로를 반환합니다.
 *
 * @param owner 저장소 소유자 ID 혹은 조직명
 * @param repo 저장소 이름
 * @returns `.cache/<owner>_<repo>/cache.json` 형식의 파일 경로 문자열
 */
const getCacheFilePath = (owner: string, repo: string): string =>
  `${CACHE_DIR}/${owner}_${repo}/cache.json`;

/**
 * 기존 캐시 파일을 읽어 {@link RepoCache} 객체를 반환합니다.
 *
 * 다음의 경우 `null`을 반환합니다:
 * - `noCache`가 `true`인 경우
 * - 캐시 파일이 존재하지 않는 경우
 * - 캐시 파일이 손상되었거나 파싱에 실패한 경우
 * - 캐시 파일에 기록된 저장소 식별자가 `owner/repo`와 일치하지 않는 경우
 *
 * @template T 캐시에 저장된 실제 데이터의 타입
 * @param owner 저장소 소유자 ID 혹은 조직명
 * @param repo 저장소 이름
 * @param noCache `true`이면 캐시를 무시하고 즉시 `null`을 반환합니다 (기본값: `false`)
 * @returns 유효한 캐시가 있으면 {@link RepoCache} 객체, 없으면 `null`
 *
 * @example
 * const cache = await loadCache<DetailedRepoData>('oss2026hnu', 'reposcore-ts');
 * if (cache) {
 *   console.log('캐시 히트:', cache.lastAnalyzedAt);
 * }
 */
export const loadCache = async <T>(
  owner: string,
  repo: string,
  noCache = false,
): Promise<RepoCache<T> | null> => {
  if (noCache) {
    console.error('캐시를 무시하고 전체 데이터를 다시 수집합니다.');
    return null;
  }

  const cacheFile = getCacheFilePath(owner, repo);
  const file = Bun.file(cacheFile);

  if (!(await file.exists())) return null;

  try {
    const cache = (await file.json()) as RepoCache<T>;
    if (cache.repository !== `${owner}/${repo}`) return null;

    console.error(`[cache] ${owner}/${repo} — 캐시에서 읽습니다.`);
    return cache;
  } catch {
    console.error('기존 캐시 파일이 손상되어 새로 수집을 시작합니다.');
    return null;
  }
};

/**
 * 분석 결과를 {@link RepoCache} 형식으로 JSON 파일에 저장합니다.
 *
 * 저장 시각(`lastAnalyzedAt`)은 호출 시점의 현재 시각으로 자동 기록됩니다.
 * 대상 디렉터리가 없는 경우 Bun이 자동으로 생성합니다.
 *
 * @template T 캐시에 저장할 실제 데이터의 타입
 * @param owner 저장소 소유자 ID 혹은 조직명
 * @param repo 저장소 이름
 * @param data 저장할 분석 결과 데이터
 * @returns 저장 완료 후 resolve되는 `Promise<void>`
 *
 * @example
 * await saveCache('oss2026hnu', 'reposcore-ts', detailedRepoData);
 */
export const saveCache = async <T>(
  owner: string,
  repo: string,
  data: T,
): Promise<void> => {
  const cache: RepoCache<T> = {
    repository: `${owner}/${repo}`,
    lastAnalyzedAt: new Date().toISOString(),
    data,
  };

  await Bun.write(
    getCacheFilePath(owner, repo),
    JSON.stringify(cache, null, 2),
  );
  console.error(`[cache] ${owner}/${repo} — 캐시를 저장했습니다.`);
};
