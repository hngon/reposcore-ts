const CACHE_DIR = '.cache';

export interface RepoCache<T> {
  repository: string;
  lastAnalyzedAt: string;
  data: T;
}

const getCacheFilePath = (owner: string, repo: string): string =>
  `${CACHE_DIR}/${owner}_${repo}/cache.json`;

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

export const saveCache = async <T>(
  owner: string,
  repo: string,
  data: T,
  analyzedAt = new Date().toISOString(),
): Promise<void> => {
  const cache: RepoCache<T> = {
    repository: `${owner}/${repo}`,
    lastAnalyzedAt: analyzedAt,
    data,
  };

  await Bun.write(
    getCacheFilePath(owner, repo),
    JSON.stringify(cache, null, 2),
  );

  console.error(`[cache] ${owner}/${repo} — 캐시를 저장했습니다.`);
};
