# gMermaid

A standalone SVG renderer for Mermaid-style diagram syntax — **zero external dependencies**, no `mermaid.js`. It parses Mermaid text into an AST and renders it as **interactive, draggable, fully themeable SVG** that you can pan, zoom, edit inline, and export to SVG/PNG.

Built to drop into [JiveDoc](#jivedoc-plugin) and any other web app.

- 🧩 **20 diagram types** — flowchart, sequence, class, ERD, state, gantt, git, mindmap, pie, timeline, journey, C4, block, quadrant, requirement, sankey, xychart, architecture, kanban, packet
- 🎨 **Theme via CSS custom properties** — swap themes live, no re-render
- 🖱️ **Drag nodes, pan/zoom, inline label editing, undo/redo**
- 💾 **Serialize state** (source + node layout) and restore it
- 📦 **ES modules**, ~one file when bundled, MIT licensed

---

## Install & build

There is no npm publish step in this repo; consume it from source or build a bundle.

```bash
make install     # install dev deps (esbuild only)
make build       # → dist/gmermaid.js, dist/gmermaid.min.js, dist/gmermaid.css
make serve       # serve examples at http://localhost:5173
```

| Command | Does |
|---|---|
| `make build` | Bundle `src/index.js` to `dist/` (unminified + minified + default CSS) |
| `make watch` | Rebuild on change |
| `make serve` | Static server over the repo (open `/examples/standalone.html`) |
| `make check` | `node --check` every source file (the project's only automated gate) |

---

## Quick start

A diagram needs two things: the **JS module** and a **base stylesheet** (the structural CSS rules that consume the theme variables — see [Theming](#theming)).

```html
<link rel="stylesheet" href="dist/gmermaid.css">  <!-- or themes/dark.css -->
<div id="diagram" style="width: 100%; height: 500px;"></div>

<script type="module">
  import { GMermaid } from './src/index.js';      // or './dist/gmermaid.js'

  const d = GMermaid.create(document.getElementById('diagram'), {
    source: `flowchart LR
      A[Start] --> B{Valid?}
      B -->|Yes| C[Process]
      B -->|No|  D[Error]`,
    theme:  'dark',
    curved: true,
  });
</script>
```

### As a Web Component (no JS wiring)

```html
<script type="module" src="./src/plugins/web-component.js"></script>

<g-diagram theme="dark" height="400px">
  flowchart LR
    A --> B --> C
</g-diagram>

<!-- or load from a .mmd file -->
<g-diagram src="./diagram.mmd" theme="light" height="300px"></g-diagram>
```

Attributes: `src`, `theme` (`dark`/`light`/`github`), `height`, `curved` (`false` for straight edges), `keyboard` (`false` to disable global shortcuts), `locked` (present = no pan/zoom/drag/edit), `lock-button` (present = show the on-diagram lock toggle).

---

## Usage

### Creating & loading

```js
const d = GMermaid.create(container, {
  source,              // Mermaid text (optional; can load() later)
  theme:    'dark',    // preset name OR a token object (see Theming)
  layout:   savedLayout, // { [nodeId]: {x, y} } to restore manual positions
  curved:   true,      // bezier vs orthogonal edges
  snapGrid: 16,        // snap dragged nodes to a grid (0 = off)
  keyboard: true,      // global keyboard shortcuts
  locked:   false,     // start locked (no pan/zoom/drag/edit; wheel passes through)
  lockButton: false,   // show an on-diagram lock/unlock toggle button
  ariaLabel: 'My diagram',
});

await d.load(newMermaidText);   // re-parse and render new source
```

### Reading & restoring state

`getState()` returns `{ source, layout }` — the original text plus current node positions — which you can persist and feed back to `loadState()`:

```js
const state = d.getState();
localStorage.setItem('diagram', JSON.stringify(state));

await d.loadState(JSON.parse(localStorage.getItem('diagram')));

d.getSource();   // → Mermaid text (including inline label edits)
d.getLayout();   // → { [id]: {x, y} }
```

### View & export

```js
d.fitToContent();
d.zoomIn(); d.zoomOut();
d.undo(); d.redo();

const svg = d.exportSVG({ inline: true });        // → SVG string (CSS inlined)
const png = await d.exportPNG({ scale: 2 });      // → PNG data-URL
```

### Lock / unlock interaction

By default the viewer captures wheel (zoom), pointer drag (pan/move) and double-click (edit). When the diagram is embedded in a larger app, **lock** it so it stays a static picture and never steals the page's scroll or clicks — the wheel passes straight through to the page:

```js
d.lock();              // disable all pan/zoom/drag/edit (wheel scrolls the page)
d.unlock();            // re-enable interaction
d.setLocked(true);     // or set explicitly
d.isLocked();          // → boolean
d.on('lockChange', locked => { /* … */ });
```

Programmatic calls (`load`, `setTheme`, `fitToContent`, `exportSVG`, …) keep working while locked. Start locked with `GMermaid.create(el, { locked: true })`, or on the web component with the `locked` attribute (`<g-diagram locked>…</g-diagram>`).

**On-diagram toggle.** For an end-user-facing control, show a small lock/unlock button in the corner of the diagram:

```js
GMermaid.create(el, { lockButton: true });   // show the toggle from the start
d.showLockButton(true);                        // or add/remove it later
d.showLockButton(false);
```

Clicking it flips the lock (the icon reflects the state) and stays clickable even while locked. On the web component use the `lock-button` attribute: `<g-diagram lock-button>…</g-diagram>`. The button is an HTML overlay, so it's never included in `exportSVG()`/`exportPNG()`.

### Events

```js
d.on('nodeMove',      ({ id, x, y })      => {});
d.on('labelEdit',     ({ id, label })     => {});
d.on('sourceChange',  (src)               => {});
d.on('historyChange', ({ canUndo, canRedo }) => {});
```

`on()` returns an unsubscribe function. Call `d.destroy()` to tear everything down.

### Keyboard shortcuts

`Ctrl/Cmd+Z` undo · `Ctrl/Cmd+Y` (or `Shift+Z`) redo. When the canvas is focused: arrow keys pan, `+`/`-` zoom, `F` fit to content. Double-click a node to edit its label (`Enter` commit, `Esc` cancel).

---

## Theming

Theming is driven by **CSS custom properties** named `--gm-*`. There are two layers:

1. **Token values** — the variable definitions (`--gm-accent: #3fb950`, …). Set by the JS `Theme` class (a built-in preset or your token object) **or** by the `--gm-*` block at the top of `themes/*.css`.
2. **Structural rules** — the actual CSS that *consumes* those tokens (`.gm-edge { stroke: var(--gm-edge) }`, `.gm-class-bg { fill: var(--gm-panel) }`, …). These live **only** in `themes/*.css` (shipped as `dist/gmermaid.css`).

> **You must include one base stylesheet** (`dist/gmermaid.css` or a `themes/*.css`) for diagrams to be fully styled. The JS theme only sets the variable *values*; the rules that use them come from the CSS. Switching the JS theme then re-colors everything live, because the structural rules are theme-agnostic.

### Three ways to customize

**1 — Built-in preset** (`dark`, `light`, `github`):

```js
GMermaid.create(el, { source, theme: 'light' });
d.setTheme('github');   // hot-swap; no re-render needed
```

**2 — Token object** (partial maps merge over the current theme — this is the main custom path):

```js
d.setTheme({
  '--gm-accent':      '#ff6b35',
  '--gm-node-fill':   '#1a1a2e',
  '--gm-node-stroke': '#ff6b35',
  '--gm-edge':        '#888',
  '--gm-font':        "'IBM Plex Mono', monospace",
});
```

You can also pass an object directly at creation: `GMermaid.create(el, { theme: { '--gm-accent': '#f0f' } })` (merges over `dark`).

**3 — External CSS** — define the variables yourself, or restyle the element classes directly for things tokens don't cover (e.g. data-viz palettes, drop shadows):

```css
.gm-container { --gm-accent: #ff6b35; --gm-node-radius: 2px; }
.gm-edge      { stroke-width: 2px; }
.gm-pie-title { font-weight: 800; }
```

### Theme tokens

| Token | Role | Token | Role |
|---|---|---|---|
| `--gm-bg` | Canvas background | `--gm-edge` | Edge stroke |
| `--gm-grid` | Grid dots | `--gm-edge-hi` | Edge stroke (hover) |
| `--gm-panel` | Box/table fill | `--gm-node-fill` | Node fill |
| `--gm-panel-border` | Box border | `--gm-node-stroke` | Node border |
| `--gm-header` | Header band fill | `--gm-node-stroke-w` | Node border width |
| `--gm-text` | Primary text | `--gm-node-radius` | Node corner radius |
| `--gm-muted` | Secondary text | `--gm-node-text` | Node label color |
| `--gm-accent` | Accent / selection highlight | `--gm-pk` / `--gm-fk` | ERD primary/foreign key |
| `--gm-accent-dim` | Dim accent | `--gm-font` | Mono font (code-like text) |
| `--gm-selected` | Selected outline | `--gm-label-font` | Label font |
| `--gm-font-size` | Base font size | `--gm-accent2`* | Class methods / composite (optional) |

\* `--gm-accent2` is consumed by the CSS (falls back to `#58a6ff`) but isn't in any preset — define it to theme class-method text and composite-state borders.

### Adding a theme preset

Edit `PRESETS` in `src/core/theme.js` (a full `--gm-*` map keyed by name), so `theme: 'mytheme'` resolves. Or skip the preset entirely and pass a token object as above.

> **Caveat — categorical palettes are not token-driven.** Data-viz diagrams that assign a color per category (mindmap, C4, pie, xychart, sankey, architecture, kanban) compute colors inside their renderers (OKLCH hue tables, etc.), so a custom theme restyles the "chrome" (background, nodes, edges, text, accent) but not those per-series colors. Change those in the relevant `src/diagrams/<type>/renderer.js`.

---

## Architecture (at a glance)

```
Mermaid text → detectType() → parse() → AST → layout → render → interactive SVG
```

- `src/index.js` — public `GMermaid` API + the `Diagram` orchestrator
- `src/core/` — `renderer` (SVG scaffold), `interact` (pan/zoom/drag), `layout` (auto-layout), `edges` (4-sided edge routing), `theme`, `events` (EventBus), `history` (undo/redo), `virtual` (culling for >100 nodes)
- `src/diagrams/<type>/` — each type has a `parser.js` (text → AST) and a `renderer.js` (AST → SVG). Parsers never touch the DOM; renderers never re-parse.
- `src/plugins/` — `web-component.js` (`<g-diagram>`), `jivedoc.js`

---

## Extending

### Add a new diagram type

Each type is a self-contained folder; wiring is centralized in `src/index.js`. To add `foo`:

1. Create `src/diagrams/foo/parser.js` exporting `parseFoo(text)` → an AST `{ type: 'foo', nodes: [...], ... }`.
2. Create `src/diagrams/foo/renderer.js` exporting `renderFoo(ast, nodeLayer, edgeLayer, interact?, curved?)`.
3. In `src/index.js`, wire it in **four** places (all keyed by the type string):
   - `import` the parser + renderer
   - add a first-line regex in `detectType()`
   - add a `case` in `parse()`
   - add a `case` in `Diagram.#render()`
4. If nodes should be draggable/auto-laid-out, add the type to `getNodes(ast)` so it returns the AST's node array. Types absent from `getNodes` render statically (e.g. pie, gantt).

Use `svgEl(tag, attrs, text)` from `core/renderer.js` to build elements, style via `var(--gm-*)`, and call `interact.attachDrag(group, node, onMove)` to make nodes draggable (redraw edges in `onMove`).

### Box-edge routing helper

For box-based diagrams, `src/core/edges.js` provides 4-sided edge anchoring — each edge connects to whichever side (top/right/bottom/left) of a box faces the other node:

```js
import { connectBoxes } from '../../core/edges.js';

const { d, p1, p2, mx, my } = connectBoxes(boxA, boxB, curved);
// boxA/boxB: { x, y, w, h } · d: SVG path · mx/my: label midpoint
```

Used by flowchart, class, state, and architecture.

### JiveDoc plugin

```js
import { registerGMermaidPlugin } from './src/plugins/jivedoc.js';

registerGMermaidPlugin(JiveDoc, { theme: 'dark', keyboard: false });
```

Registers a `diagram` block type that renders an interactive diagram, persists `{ source, layout }`, and inherits the editor theme. `keyboard: false` avoids hijacking editor key events.

---

## Examples

Open these via `make serve`:

- `examples/standalone.html` — full editor playground (all 20 types, export, save/load)
- `examples/all-diagrams.html` — gallery of every diagram type
- `examples/jivedoc-plugin.html` — JiveDoc integration demo

---

## License

MIT
