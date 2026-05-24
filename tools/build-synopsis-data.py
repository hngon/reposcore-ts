"""
CLI help 출력을 캡처하여 jinja2 렌더링용 JSON 데이터를 stdout으로 출력합니다.

사용법 (프로젝트 루트에서):
    python tools/build-synopsis-data.py | jinja2 --format json README-template.md -o README.md

동작:
    1. `bun run index.ts --help` 를 실행하여 CLI help 출력을 캡처
    2. {"synopsis": "<help 출력>"} 형식의 JSON을 stdout으로 출력
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent


def get_cli_help() -> str:
    """bun run index.ts --help 를 실행하여 출력 결과를 반환합니다."""
    try:
        result = subprocess.run(
            ["bun", "run", "index.ts", "--help"],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
            timeout=30,
        )
        output = result.stdout.strip() or result.stderr.strip()
        if not output:
            print("[오류] CLI help 출력이 비어 있습니다.", file=sys.stderr)
            sys.exit(1)
        return output
    except FileNotFoundError:
        print("[오류] bun 명령을 찾을 수 없습니다. bun이 설치되어 있는지 확인하세요.", file=sys.stderr)
        sys.exit(1)
    except subprocess.TimeoutExpired:
        print("[오류] CLI 실행 시간이 초과되었습니다.", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    print("[실행] bun run index.ts --help", file=sys.stderr)
    help_output = get_cli_help()

    print("[캡처] CLI help 출력:", file=sys.stderr)
    for line in help_output.splitlines():
        print(f"  {line}", file=sys.stderr)

    print(json.dumps({"synopsis": help_output}, ensure_ascii=False))


if __name__ == "__main__":
    main()
