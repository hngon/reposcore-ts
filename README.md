# reposcore-ts

`reposcore-ts`는 GraphQL을 사용하여 오픈소스 수업 저장소의 학생 참여 점수를 계산하는 **TypeScript 기반 CLI**입니다.


## Usage

### 의존성 설치

```bash
bun install
```

### CLI 실행

여러 개의 저장소를 한 번에 분석할 수 있습니다.

```bash
# 기본 실행 예시
bun run index.ts <owner/repo...> [options]

# 저장소 2개 실행 예시
bun run index.ts oss2026hnu/reposcore-cs oss2026hnu/reposcore-ts

# GitHub 개인 액세스 토큰(PAT) 사용 예시
bun run index.ts oss2026hnu/reposcore-ts --token YOUR_GITHUB_TOKEN
```

## Synopsis

```text
reposcore-ts

Usage:
  $ reposcore-ts [...repos]

Commands:
  [...repos]  대상 저장소 목록 (예: owner/repo1 owner/repo2)

For more info, run any command with the `--help` flag:
  $ reposcore-ts --help

Options:
  --token <token>    GitHub Personal Access Token (default: $GITHUB_TOKEN)
  --format <format>  출력 형식 (csv, txt) (default: csv)
  --no-cache         캐시를 무시하고 GitHub API를 새로 호출합니다 (default: true)
  -h, --help         Display this message
```

## Synopsis 업데이트

Synopsis 섹션은 CLI 도움말을 자동으로 반영합니다. 프로그램 옵션 또는 실행 방식이 변경되면 다음 명령어로 업데이트하세요:

```bash
make synopsis
```

> ⚠️ `README.md`를 직접 수정하지 마세요.
> 수동 편집 내용은 `README-template.md`에서 관리하며, `README.md`는 `make synopsis`를 통해 자동 생성됩니다.
> 프로그램 옵션, 인수, 또는 도움말 출력이 변경된 경우 반드시 위 명령어를 실행하여 `README.md`를 다시 생성하세요.
