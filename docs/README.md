# 프로젝트 운영 지침 및 개발 가이드

> 점수 계산 공식 및 이슈/PR 작성 주의사항 등 공통 사항은
> [reposcore-cs 저장소](https://github.com/oss2026hnu/reposcore-cs)의 docs를 참고하세요.

## 문서 목록

- [cac-guide.md](./cac-guide.md): Cac 라이브러리 가이드
- [octokit-guide.md](./octokit-guide.md): TypeScript/Bun 기반 GitHub GraphQL 가이드
- [ts-bun-guide.md](./ts-bun-guide.md): TypeScript 및 실행 환경 Bun 가이드
- [ts-convention.md](./ts-convention.md): TypeScript 코딩 컨벤션 가이드
- [tsdoc-typedoc-guide.md](./tsdoc-typedoc-guide.md): TSDoc + TypeDoc 가이드
- [vscode-extension.md](./vscode-extension.md): TypeScript 개발을 위한 VSCode 확장 가이드

---
> ⚠️ **문서 목록은 수작업으로 갱신하지 마세요.**
> `docs/*.md` 문서를 생성·삭제하거나 제목을 변경할 경우, 반드시
> 아래 명령어를 실행하여 목록을 자동 갱신하세요.
>
> ```bash
> make docs
> ```
---
## 문서 파일 생성 규칙

프로젝트 내 문서 파일의 일관성을 유지하기 위해 다음과 같은 파일 이름 생성 규칙을 따릅니다.

### 기본 규칙

- 모든 파일 이름은 소문자(lowercase)를 사용합니다.
- 단어 구분은 공백 대신 하이픈(-)을 사용합니다.
- 파일 확장자는 `.md`를 사용합니다.

### 예시

- `setup-guide.md`
- `api-reference.md`
- `contributing-guide.md`
- `error-handling.md`

### 추가 규칙

- 파일 이름은 간결하고 의미를 명확하게 전달해야 합니다.
- 불필요한 특수문자는 사용하지 않습니다.
- 동일한 의미의 단어는 통일하여 사용합니다 (예: guide, doc 등)

---
