"""
docs/ 폴더의 마크다운 파일을 탐색하여 jinja2 렌더링용 JSON 데이터를 stdout으로 출력합니다.

사용법 (프로젝트 루트에서):
    python tools/build-docs-data.py | jinja2 --format json docs/README-template.md -o docs/README.md

동작:
    1. docs/ 폴더에서 README.md, README-template.md를 제외한 .md 파일 탐색
    2. 각 파일의 첫 번째 H1(#) 헤더를 제목으로 추출
    3. 파일명 기준 알파벳 순 정렬
    4. {"docs": [...]} 형식의 JSON을 stdout으로 출력
"""

import json
import sys
from pathlib import Path

DOCS_DIR = Path(__file__).parent.parent / "docs"
EXCLUDE_FILES = {"readme.md", "readme-template.md"}


def extract_title(md_path: Path) -> str:
    """마크다운 파일에서 첫 번째 H1 헤더 텍스트를 추출합니다."""
    try:
        with open(md_path, encoding="utf-8") as f:
            for line in f:
                stripped = line.strip()
                if stripped.startswith("# "):
                    return stripped[2:].strip()
    except (OSError, UnicodeDecodeError):
        pass
    return md_path.stem


def collect_docs(docs_dir: Path) -> list[dict[str, str]]:
    """docs/ 폴더에서 제외 목록을 뺀 .md 파일을 수집하여 리스트로 반환합니다."""
    entries = []
    for md_file in sorted(docs_dir.glob("*.md")):
        if md_file.name.lower() in EXCLUDE_FILES:
            continue
        entries.append({"filename": md_file.name, "title": extract_title(md_file)})
    return entries


def main() -> None:
    if not DOCS_DIR.is_dir():
        print(f"[오류] docs 폴더를 찾을 수 없습니다: {DOCS_DIR}", file=sys.stderr)
        sys.exit(1)

    entries = collect_docs(DOCS_DIR)
    print(f"[탐색] {len(entries)}개 문서 발견:", file=sys.stderr)
    for entry in entries:
        print(f"  • {entry['filename']}: {entry['title']}", file=sys.stderr)

    print(json.dumps({"docs": entries}, ensure_ascii=False))


if __name__ == "__main__":
    main()
