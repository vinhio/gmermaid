# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **AI PRIORITY**: Files in `.claude/ai/` are authoritative and override any conflicting content in this file. Read them before starting any work.

This file provides project-specific context for Claude Code (claude.ai/code). AI behavior rules live in `.claude/ai/`.

## AI Operating Rules

The `.claude/ai/` directory contains rules and workflows that govern AI behavior in this repository. They override all other instructions here.

- @.claude/ai/startup.md — Entry point: read this first.
- @.claude/ai/AGENTS.md — Core AI rules: priorities, anti-hallucination, security, hard stops, quality thresholds, and confidence guidelines.
- @.claude/ai/coding.md — Coding workflow: clarify → plan → implement → verify → report.
- @.claude/ai/communication.md — Communication style: tone, response format, and confidence tagging.

> `.claude/ai/sync.md` describes how to propagate `AGENTS.md` to other AI tools (Cursor, Windsurf, Gemini CLI, etc.).

The `.claude/skills/typescript-expert/` skill provides Typescript.

## What this is

gMermaid is a standalone, zero-dependency SVG renderer for Mermaid-style diagram syntax. It parses Mermaid text into an AST and renders it as interactive, draggable, themeable SVG — without pulling in the upstream `mermaid` library. Source is plain ES modules; the only dev dependency is `esbuild` (for bundling) and `python3` (for the dev server).

## Commands

```bash
make install     # npm install (esbuild only)
make build       # bundle src/index.js → dist/gmermaid.js (+ .min.js + .css)
make watch       # rebuild on change (unminified only)
make serve       # python http server on :5173, open /examples/standalone.html
make check       # node --check every file under src/ — the de-facto "lint/test"
make clean       # rm -rf dist/
```

There is **no test framework and no linter**. `make check` (syntax validation via `node --check`) is the only automated gate. Verify behavior by loading `examples/*.html` through `make serve` in a browser. To syntax-check a single file: `node --check src/diagrams/<type>/parser.js`.

## Architecture

**Entry point** is `src/index.js`, which exposes the `GMermaid` singleton (`create`, `parse`, `detectType`) and the `Diagram` class. The pipeline is:

```
text → detectType() → parse() → AST → #applyLayout() → #render() → interactive SVG
```

- **`detectType(text)`** matches the first line against a regex table to pick a diagram type.
- **`parse(text)`** dispatches to the matching `parse<Type>` function. Each diagram type owns a `parser.js` (text → AST) and a `renderer.js` (AST → SVG DOM) under `src/diagrams/<type>/`. The two are deliberately decoupled: parsers never touch the DOM, renderers never re-parse.
- **`Diagram`** (in `index.js`) is the orchestrator. It wires together the core modules, holds the active AST + layout, and is the public API (`load`, `getState`/`loadState`, `setTheme`, `undo`/`redo`, `exportSVG`/`exportPNG`, `fitToContent`, `on`).

### Adding a new diagram type

This is the most common extension. You must touch `src/index.js` in **four** places, all keyed by the type string:

1. `import` the parser + renderer at the top.
2. Add a first-line regex in `detectType()`.
3. Add a `case` in `parse()`'s switch.
4. Add a `case` in `Diagram.#render()`'s switch (pass `interact`/`curved` only if the type is draggable).

If nodes should be draggable/auto-laid-out, also add the type to `getNodes(ast)` so it returns that AST's node array (e.g. `ast.entities`, `ast.states`). Types absent from `getNodes` render statically (pie, gantt, sankey, etc.).

### Core modules (`src/core/`)

- **`renderer.js`** — builds the SVG scaffold: `stage` (root svg) → `viewport` (pan/zoom group) → `edgeLayer` + `nodeLayer`. Defs include the grid pattern and arrow markers. `svgEl(tag, attrs, text)` is the shared element factory used everywhere.
- **`interact.js`** — pan/zoom, node dragging, snap-to-grid, inline label editing, `fitToContent`. The view state is `{x, y, k}` applied as a transform on the viewport.
- **`layout.js`** — `layoutFlowchart` (Kahn topological layering) for flowchart/class; `layoutGrid` fallback for everything else. Only runs on nodes that have no saved position.
- **`events.js`** — tiny `EventBus` (`on`/`off`/`emit`). Cross-module communication goes through the bus, not direct calls. Key events: `nodeMove`, `labelEdit`, `sourceChange`.
- **`history.js`** — command-pattern undo/redo stack (do/undo closures), driven by bus events, capped at 50.
- **`theme.js`** — CSS custom properties (`--gm-*`). `PRESETS` holds `dark`/`light`/`github`; `apply()` injects a `<style>` into the container. All visual styling is theme tokens, never hardcoded colors in renderers.
- **`virtual.js`** — DOM culling for large diagrams. Activates automatically when a diagram has > 100 nodes (`#VIRTUAL_THRESHOLD`); detaches off-screen node elements and re-inserts on pan.

### Theming

Renderers reference CSS variables (`var(--gm-node-fill)`, etc.) rather than literal colors so a single theme switch restyles everything. `themes/*.css` are the standalone stylesheet copies; `src/core/theme.js` `PRESETS` are the JS-injected equivalents — **keep the two in sync** when changing tokens. `exportPNG` resolves these vars to literals before rasterizing (canvas can't read CSS custom properties).

### Integration surfaces (`src/plugins/`)

- **`web-component.js`** — `<g-diagram>` custom element (Shadow DOM). Reads diagram source from text content or a `src` .mmd URL; attributes `theme`/`height`/`curved`/`keyboard`.
- **`jivedoc.js`** — adapter registering a `diagram` block type in the JiveDoc editor. Note it defaults `keyboard: false` to avoid hijacking editor key events, and persists `{source, layout}` via bus events.

## Conventions

- **Documentation is mandatory (hard rule).** Every time you create or update code, add/update English JSDoc in the same change — file header on new files, JSDoc (`@param`/`@returns`) on every function and class, inline notes for non-obvious logic, and keep docs in sync when changing signatures/behavior. See `.claude/ai/coding.md` → "Code documentation — BẮT BUỘC".
- Pure ESM (`"type": "module"`), `import`/`export` only, no CommonJS.
- Private class fields (`#field`) are used throughout for encapsulation — follow that style.
- No runtime dependencies. Do not add any; the bundle must stay self-contained (`build.js` bundles everything, no externals).
- Version lives in `package.json` **and** is hardcoded in `index.js` (`GMermaid.version`) — bump both together.
