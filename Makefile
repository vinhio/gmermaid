NODE   ?= node
NPM    ?= npm
PORT   ?= 5173
DIST   := dist

.DEFAULT_GOAL := help

# ── Help ──────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@echo "gMermaid v$(shell node -p "require('./package.json').version") — available targets:"
	@echo ""
	@echo "  make install      Install dev dependencies"
	@echo "  make build        Bundle → dist/ (unminified + minified + css)"
	@echo "  make watch        Build in watch mode"
	@echo "  make serve        Serve examples at http://localhost:$(PORT)"
	@echo "  make check        Syntax-check all source JS files"
	@echo "  make clean        Remove dist/"
	@echo "  make clean-all    Remove dist/ and node_modules/"
	@echo "  make version      Show current version"
	@echo ""

# ── Install ───────────────────────────────────────────────────────────────────
.PHONY: install
install: package.json
	$(NPM) install

node_modules: package.json
	$(NPM) install

# ── Build ─────────────────────────────────────────────────────────────────────
.PHONY: build
build: node_modules
	$(NODE) build.js
	@echo "  size: $$(du -sh $(DIST)/gmermaid.min.js | cut -f1) minified"

.PHONY: watch
watch: node_modules
	$(NODE) build.js --watch

# ── Serve ─────────────────────────────────────────────────────────────────────
.PHONY: serve
serve:
	@echo "  Serving at http://localhost:$(PORT)/examples/standalone.html"
	@python3 -m http.server $(PORT) --directory . --bind 127.0.0.1

# ── Check ─────────────────────────────────────────────────────────────────────
.PHONY: check
check:
	@echo "Checking syntax…"
	@find src -name "*.js" | sort | while read f; do \
	  $(NODE) --check "$$f" && echo "  ✓ $$f" || exit 1; \
	done
	@echo "All OK"

# ── Clean ─────────────────────────────────────────────────────────────────────
.PHONY: clean
clean:
	rm -rf $(DIST)
	@echo "  removed dist/"

.PHONY: clean-all
clean-all: clean
	rm -rf node_modules package-lock.json
	@echo "  removed node_modules/"

# ── Version ───────────────────────────────────────────────────────────────────
.PHONY: version
version:
	@$(NODE) -p "require('./package.json').version"
