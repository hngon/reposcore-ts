# TypeScript 및 실행 환경 Bun 가이드

> 본 프로젝트는 Bun **1.3.13** 을 기준으로 작성되었습니다.
> GitHub Codespaces 환경을 기준으로 설명합니다.

---

##  Bun이란?

[Bun](https://bun.sh)은 JavaScript/TypeScript를 위한 고속 올인원 런타임입니다.
Node.js 대신 TypeScript를 별도 컴파일 없이 직접 실행할 수 있으며,
패키지 매니저(`bun install`), 테스트 러너(`bun test`), 번들러(`bun build`)를 모두 내장하고 있습니다.

> **참고:** bun과 bunx의 차이
> - bun : 패키지 설치 및 프로젝트 실행 (`bun install`, `bun run` 등)
> - bunx : 패키지를 일회성으로 실행하는 명령어 (`npx`와 유사)

---

## Codespaces에서 Bun 설치 및 확인

본 프로젝트의 GitHub Codespaces 환경(` .devcontainer/devcontainer.json`)에는 **Bun 자동 설치 설정**이 포함되어 있습니다. 따라서 별도의 수동 설치 과정 없이 바로 사용이 가능합니다.

### 설치 여부 확인
Codespaces가 생성된 후 터미널을 열고 아래 명령어로 설치 여부를 확인합니다.

```bash
bun --version
# 예상 출력: 1.3.13 (또는 최신 버전)

> **참고:** Codespaces를 재시작하면 Bun이 초기화되어 다시 설치해야 할 수 있습니다.
> 매번 재설치가 번거롭다면 팀에서 `devcontainer.json`의 `postCreateCommand`에
> 설치 명령을 등록하는 것을 고려하세요.

만약 Bun 명령이 인식되지 않는 경우에는 터미널을 새로 열거나 아래 명령으로 환경 변수를 다시 적용할 수 있습니다.

source ~/.bashrc

필요한 경우에만 아래 명령으로 Bun을 수동 설치할 수 있습니다.

curl -fsSL https://bun.sh/install | bash
---

##  의존성 설치

프로젝트 루트 디렉터리에서 아래 명령을 실행합니다.

```bash
bun install
```

`bun.lock` 파일 기준으로 정확한 버전이 설치됩니다.

> **주의:** 프로젝트에 `package-lock.json`과 `bun.lock`이 함께 존재하는 경우,
> Bun은 `bun.lock`을 우선합니다. 패키지 관리는 **Bun으로만** 수행하세요.
> npm을 혼용하면 lock 파일이 불일치할 수 있습니다.

---

##  TypeScript 파일 실행

Bun은 TypeScript를 별도 컴파일 없이 직접 실행합니다.

```bash
bun run index.ts
```

`package.json`의 `scripts`에 등록된 명령도 동일하게 실행합니다.

```bash
bun run <스크립트명>
```

---

##  테스트 실행

Bun 내장 테스트 러너를 사용합니다. Jest와 호환되는 API(`describe`, `test`, `expect`)를 그대로 사용할 수 있습니다.

```bash
# 전체 테스트 실행
bun test

# 특정 파일만 실행
bun test src/github-service.test.ts
```

Bun이 자동으로 감지하는 테스트 파일 규칙:

- `*.test.ts`
- `*.spec.ts`
- `__tests__/*.ts`

---

##  패키지 추가 / 제거

```bash
# 패키지 추가
bun add <패키지명>

# 개발 의존성으로 추가
bun add -d <패키지명>

# 패키지 제거
bun remove <패키지명>
```

---

##  tsconfig.json 주의사항

본 프로젝트의 `tsconfig.json`은 Bun 환경에 맞게 설정되어 있습니다.

| 옵션 | 값 | 이유 |
|---|---|---|
| `module` | `Preserve` | Bun의 ESM 처리 방식에 최적화 |
| `moduleResolution` | `bundler` | Bun 번들러 모드 사용 |
| `types` | `["bun"]` | Bun 전용 타입(`Bun.file` 등) 사용 |
| `noEmit` | `true` | Bun이 직접 실행하므로 JS 파일 출력 불필요 |

---

##  자주 사용하는 명령 요약

| 명령 | 설명 |
|---|---|
| `bun install` | 의존성 설치 |
| `bun run index.ts` | TypeScript 파일 직접 실행 |
| `bun test` | 전체 테스트 실행 |
| `bun add <pkg>` | 패키지 추가 |
| `bun remove <pkg>` | 패키지 제거 |
| `bun tsc --noEmit` | 타입 검사만 수행 |


---

##  테스트 프레임워크 및 라이브러리 선택 기준

Bun은 기본적으로 `bun test`와 `bun:test` 모듈을 제공하므로,
일반적인 TypeScript 단위 테스트는 별도의 테스트 프레임워크 없이 작성할 수 있습니다.

Bun 내장 테스트 러너는 `describe`, `test`, `expect`와 같은 Jest 유사 API를 제공하며,
TypeScript를 별도 컴파일 없이 바로 실행할 수 있습니다.

---

### Bun 내장 테스트 예시

```ts
import { describe, expect, test } from "bun:test";

function add(a: number, b: number): number {
  return a + b;
}

describe("add", () => {
  test("두 숫자를 더한다", () => {
    expect(add(1, 2)).toBe(3);
  });
});
```

### 상황별 테스트 도구 선택 기준

| 목적           | 권장 도구           | 설명                        |
| ------------ | --------------- | ------------------------- |
| 단위 테스트       | Bun 내장 테스트 러너   | 함수, 클래스, CLI 로직 검증        |
| Mocking      | `bun:test`      | mock, spy, module mock    |
| UI/DOM 테스트   | Testing Library | 사용자 관점에서 UI 동작 검증         |
| E2E 테스트      | Playwright      | 실제 브라우저 기반 End-to-End 테스트 |
| Vite 기반 프로젝트 | Vitest          | Vite 환경에 최적화된 테스트 도구      |

### 주요 테스트 도구

####  Bun 내장 테스트 러너 (기본 권장)

```bash
bun test
```
- 별도 설치 없이 사용 가능
- TypeScript 직접 실행 지원
- Jest 유사 API 제공

👉 본 프로젝트에서는 기본적으로 Bun 테스트 러너 사용을 권장합니다.

####  Vitest

```bash
bun add -d vitest
```
```json
{
  "scripts": {
    "test:vitest": "vitest"
  }
}
```
- Vite 기반 프로젝트에서 사용
- 빠른 실행 속도와 HMR 지원
- 프론트엔드 테스트에 적합

####  Testing Library

```bash
bun add -d @testing-library/dom
```
- DOM 및 UI 컴포넌트 테스트
- 사용자 행동(click, input 등) 기반 검증

####  Playwright

```bash
bun add -d @playwright/test
bunx playwright install
```
- 실제 브라우저 기반 테스트
- 로그인, 페이지 이동 등 사용자 흐름 검증
- E2E 테스트에 적합

####  Jest (참고)

Bun은 Jest와 유사한 API(`describe`, `test`, `expect`)를 기본적으로 제공합니다.

기존 Jest 기반 프로젝트를 Bun에서 실행할 수는 있지만,
완전한 호환을 보장하지는 않습니다.

👉 신규 프로젝트에서는 Bun 내장 테스트 러너 사용을 권장합니다.

### 권장 사용 방식

- 기본 단위 테스트 → Bun (bun test)
- UI 테스트 → Testing Library
- E2E 테스트 → Playwright
- Vite 프로젝트 → Vitest

프로젝트의 목적과 환경에 따라 적절한 도구를 선택하여 사용합니다.

---

## 참고 자료

- [Bun 공식 문서](https://bun.sh/docs)
- [Bun 1.x 릴리즈 노트](https://bun.sh/blog)
- [TypeScript 공식 문서](https://www.typescriptlang.org/docs/)
