PYTHON ?= python3
JINJA2 ?= jinja2

DOCS_MD := $(filter-out docs/README.md docs/README-template.md, $(wildcard docs/*.md))

docs/README.md: $(DOCS_MD) docs/README-template.md tools/build-docs-data.py
	$(PYTHON) tools/build-docs-data.py | $(JINJA2) --format json --trim-blocks --lstrip-blocks docs/README-template.md -o docs/README.md

README.md: README-template.md index.ts tools/build-synopsis-data.py
	$(PYTHON) tools/build-synopsis-data.py | $(JINJA2) --format json README-template.md -o README.md

.PHONY: docs synopsis all
all: docs synopsis
docs: docs/README.md
synopsis: README.md
