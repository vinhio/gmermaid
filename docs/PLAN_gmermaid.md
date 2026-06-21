# PLAN: gMermaid — Custom Diagram Engine

Thư viện SVG standalone đọc cú pháp Mermaid, render diagram có thể kéo thả và tuỳ biến style hoàn toàn.
Dùng như plugin độc lập cho JiveDoc và các ứng dụng khác.

---

## 1. Tổng Quan

**Mục tiêu:**
- Parse toàn bộ cú pháp Mermaid (20 diagram types)
- Render bằng SVG thuần — không dùng mermaid.js, không external dependencies
- Cho phép drag-drop node, pan/zoom canvas
- Style tuỳ biến hoàn toàn qua CSS custom properties (hot-swap, không cần re-render)
- Expose plugin API để tích hợp vào JiveDoc

**Nguồn tham khảo kiến trúc:** `docs/erd-viewer.html` (drag, pan/zoom, screenToWorld, SVG layers)

---

## 2. Kiến Trúc — Pipeline 4 Tầng

```
Mermaid text  →  Parser (AST)  →  Layout Engine  →  SVG Renderer
                     ↕                 ↕                  ↕
                  EventBus ─────────────────────────────────→ host app
                  Theme/CSS vars ──────────────────────────→ hot-reload
```

Mỗi tầng tách rời hoàn toàn. Toàn bộ giao tiếp qua EventBus hoặc return value.
**Zero external dependencies.**

---

## 3. Các Module

| Module | Vai trò | Hiện thực |
|---|---|---|
| Parser | Tokenize → parse Mermaid text → AST chuẩn hoá. Detect diagram type từ dòng đầu. | Phân tán theo loại: `diagrams/<type>/parser.js`; điều phối tại `index.js` (`detectType`/`parse`) |
| Layout | Tính x,y cho nodes. Auto-layout (topological layering) + grid fallback. | `core/layout.js` |
| Renderer | AST + layout → SVG DOM. Mỗi diagram type có renderer riêng. | `core/renderer.js` (scaffold) + `diagrams/<type>/renderer.js` |
| Theme | Token-based CSS vars. Preset: dark/light/github. Hot-swap không re-render. | `core/theme.js` |
| Interact | Pan/zoom, drag-drop, select, inline label edit, fit-to-content. | `core/interact.js` |
| Router | Edge routing: bezier, orthogonal elbow, neo 4 phía, arrowhead/crow's foot. | `core/edges.js` |
| History | Undo/redo command stack (max 50). | `core/history.js` |
| Virtual | DOM culling cho diagram lớn (>100 nodes). | `core/virtual.js` |
| Export | SVG inline/linked, PNG via canvas, JSON state (source + layout). | `Diagram` trong `index.js` (`exportSVG`/`exportPNG`/`getState`) |
| Plugin | Adapter mount vào host app. JiveDoc: register block type, serialize. | `plugins/jivedoc.js`, `plugins/web-component.js` |

---

## 4. AST Format Mẫu

```js
// Input: "flowchart LR\n  A[Start] --> B{Decision}\n  B --> |Yes| C[End]"

// AST output:
{
  type: "flowchart",
  direction: "LR",
  nodes: [
    { id: "A", shape: "rect",    label: "Start"    },
    { id: "B", shape: "diamond", label: "Decision" },
    { id: "C", shape: "rect",    label: "End"      },
  ],
  edges: [
    { from: "A", to: "B", label: "",    arrow: "-->" },
    { from: "B", to: "C", label: "Yes", arrow: "-->" },
  ]
}
```

---

## 5. Diagram Types — Đầy Đủ

### P1 — Ưu tiên cao (implement trước)

| Diagram | Mermaid keyword | Drag |
|---|---|---|
| Flowchart | `flowchart` / `graph` | Node drag |
| Sequence Diagram | `sequenceDiagram` | Lane reorder |
| Class Diagram | `classDiagram` | Node drag |
| Entity Relationship | `erDiagram` | Node drag (port erd-viewer) |
| State Diagram | `stateDiagram-v2` | Node drag |

### P2 — Ưu tiên trung bình

| Diagram | Mermaid keyword | Drag |
|---|---|---|
| Gantt Chart | `gantt` | Bar resize |
| Git Graph | `gitGraph` | Lane reorder |
| Mindmap | `mindmap` | Node drag |
| Pie Chart | `pie` | — |
| Timeline | `timeline` | Event drag |
| User Journey | `journey` | Step reorder |
| C4 Diagram | `C4Context` etc. | Node drag |

### P3 — Ưu tiên thấp

| Diagram | Mermaid keyword | Drag |
|---|---|---|
| Block Diagram | `block-beta` | Node drag |
| Quadrant Chart | `quadrantChart` | Point drag |
| Requirement Diagram | `requirementDiagram` | Node drag |
| Sankey Diagram | `sankey-beta` | Node reorder |
| XY Chart | `xychart-beta` | — |
| Architecture Diagram | `architecture-beta` | Node drag |
| Kanban | `kanban` | Card drag |
| Packet Diagram | `packet-beta` | — |

---

## 6. Interaction & Editing

**Canvas (tất cả diagrams):**
- Pan: middle-button hoặc space+drag
- Zoom: scroll wheel, pinch-to-zoom, clamp 10%–500%
- Fit to content: phím `F`, animate transition
- Click chọn node, `Shift+click` multi-select, marquee drag chọn vùng

**Node editing:**
- Drag node → edges tự re-route, snap-to-grid optional (16px)
- Double-click → `<foreignObject>` input overlay inline label edit
- `Enter` commit, `Esc` cancel, cập nhật AST

**History:**
- Undo/Redo: command pattern, max 50 steps, `Ctrl+Z / Ctrl+Y`

**State serialization:**
```js
// Lưu 2 thứ tách biệt:
{
  source: "flowchart LR\n  A --> B",   // Mermaid text gốc
  layout: {                             // vị trí manual (null = auto-layout)
    "A": { x: 120, y: 80 },
    "B": { x: 340, y: 80 }
  }
}
```

Khi render: node có override trong `layout` → dùng đó; còn lại → auto-layout.

---

## 7. Theme & Style System

```css
/* CSS custom properties — override bất kỳ đâu */
:root, .gm-diagram {
  /* Canvas */
  --gm-bg:            #0d1117;
  --gm-grid-dot:      #1c2128;

  /* Nodes */
  --gm-node-fill:     #161b22;
  --gm-node-stroke:   #30363d;
  --gm-node-stroke-w: 1.5px;
  --gm-node-radius:   8px;
  --gm-node-text:     #e6edf3;

  /* Edges */
  --gm-edge-stroke:   #3c4655;
  --gm-edge-stroke-w: 1.5px;
  --gm-edge-label:    #8b949e;

  /* States */
  --gm-accent:        #3fb950;
  --gm-selected:      #c6f24e;

  /* Typography */
  --gm-font:          'JetBrains Mono', monospace;
  --gm-font-size:     12px;
}
```

Per-node override (từ Mermaid syntax hoặc programmatic):
```
style A fill:#ff6b35,stroke:#fff,color:#000
classDef hot fill:#ff6b35; class A,B hot
```

```js
diagram.setNodeStyle('A', { fill: '#ff6b35' })
diagram.setTheme('dark')          // preset
diagram.setTheme(customTokens)    // object override
```

---

## 8. Public API

```js
// Mount
const d = GMermaid.create(container, {
  source:   mermaidText,
  layout:   savedLayout,    // optional
  editable: true,
  theme:    'dark',
})

// Load/update
await d.load(newMermaidText)

// Read state
d.getSource()   // → string (Mermaid text, kể cả label edits)
d.getLayout()   // → { [nodeId]: {x, y} }

// Export
d.exportSVG({ inline: true })   // → SVG string

// Events
d.on('nodeMove',    ({ id, x, y }) => { ... })
d.on('labelEdit',   ({ id, label }) => { ... })
d.on('sourceChange', src => { ... })

// Cleanup
d.destroy()
```

**Web Component (tuỳ chọn):**
```html
<g-diagram theme="dark" editable="true">
  flowchart LR
    A --> B --> C
</g-diagram>
```

---

## 9. JiveDoc Plugin Integration

```js
JiveDoc.registerBlockType({
  type:  'diagram',
  label: 'Diagram',
  icon:  '◇',

  render: ({ container, data }) => {
    const d = GMermaid.create(container, {
      source:   data.source,
      layout:   data.layout,
      editable: true,
      theme:    'dark',
    })
    d.on('sourceChange', src => { data.source = src })
    d.on('nodeMove',     pos => { data.layout = pos  })
    return () => d.destroy()
  },

  serialize:   ({ source, layout }) => JSON.stringify({ source, layout }),
  deserialize: str => JSON.parse(str),
})
```

---

## 10. Lộ Trình Triển Khai

### Phase 1 — Foundation (~2 tuần)
- Tokenizer + Parser cơ bản (flowchart, erDiagram)
- AST data model
- SVG canvas: pan/zoom, grid (port từ erd-viewer)
- Drag-and-drop (port từ erd-viewer: screenToWorld, setPointerCapture)
- Theme system + CSS vars
- EventBus

### Phase 2 — P1 Diagrams (~3 tuần)
- Flowchart renderer (7 node shapes, 6 arrow types, subgraph)
- Sequence Diagram (lifelines, activation, notes, loops)
- Class Diagram (UML: visibility, inheritance, compose, assoc)
- ERD (port erd-viewer + Mermaid parser)
- State Diagram v2 (composite states, fork/join)
- Auto-layout engine (topological sort, layer assignment)

### Phase 3 — Editing & Export (~2 tuần)
- Inline label editing (`<foreignObject>` overlay)
- Undo/redo history stack
- Snap-to-grid, alignment guides
- SVG export (inline CSS)
- PNG export via canvas
- JSON state save/restore

### Phase 4 — JiveDoc Plugin (~1 tuần)
- Block type registration API
- Serialize/deserialize
- Toolbar: theme toggle, export, reset layout
- Web Component `<g-diagram>`
- Responsive ResizeObserver

### Phase 5 — P2 Diagrams (~3 tuần)
- Gantt, GitGraph, Mindmap, Pie, Timeline, Journey, C4

### Phase 6 — P3 + Polish (~3 tuần)
- Block, Quadrant, Requirement, Sankey, XY, Architecture, Kanban, Packet
- Virtual rendering cho diagram lớn
- Accessibility: keyboard nav, ARIA
- Docs + examples gallery

---

## 11. Cấu Trúc File

```
gmermaid/
├── src/
│   ├── core/               # (parsing is per-diagram, not centralized here — see note below)
│   │   ├── events.js       # EventBus (pub/sub)
│   │   ├── theme.js        # CSS vars + token system, presets, hot-swap
│   │   ├── renderer.js     # SVG scaffold (stage/viewport/layers) + svgEl() factory
│   │   ├── interact.js     # Pan, zoom, drag, select, inline label edit, fit-to-content
│   │   ├── layout.js       # Auto-layout engine (topological layering + grid fallback)
│   │   ├── edges.js        # Edge routing: 4-sided anchors, bezier / orthogonal paths
│   │   ├── history.js      # Undo/redo command stack
│   │   └── virtual.js      # DOM culling for large diagrams
│   │
│   ├── diagrams/           # 1 folder per diagram type
│   │   ├── flowchart/
│   │   │   ├── parser.js
│   │   │   └── renderer.js
│   │   ├── sequence/
│   │   ├── class/
│   │   ├── erd/            # port từ erd-viewer.html
│   │   ├── state/
│   │   ├── gantt/
│   │   ├── git/
│   │   ├── mindmap/
│   │   ├── pie/
│   │   ├── timeline/
│   │   ├── journey/
│   │   ├── c4/
│   │   ├── block/
│   │   ├── quadrant/
│   │   ├── requirement/
│   │   ├── sankey/
│   │   ├── xychart/
│   │   ├── architecture/
│   │   ├── kanban/
│   │   └── packet/
│   │
│   ├── plugins/
│   │   ├── jivedoc.js        # JiveDoc block registration
│   │   └── web-component.js  # <g-diagram> custom element
│   │
│   └── index.js              # Public API export
│
├── themes/
│   ├── dark.css
│   ├── light.css
│   └── github.css
│
├── examples/
│   ├── standalone.html       # Demo đơn giản
│   ├── all-diagrams.html     # Gallery tất cả types
│   └── jivedoc-plugin.html   # Integration demo
│
└── dist/
    ├── gmermaid.js           # Bundle (ES module)
    ├── gmermaid.min.js
    └── gmermaid.css          # Default theme
```

> **Lưu ý — bản kế hoạch vs. mã nguồn thực tế:** kiến trúc triển khai đã đi lệch
> khỏi sơ đồ file ban đầu ở vài điểm (đã cập nhật ở trên cho khớp mã nguồn):
>
> - **Không có `core/parser.js` / `core/lexer.js`.** Việc parse được phân tán theo
>   từng loại diagram tại `src/diagrams/<type>/parser.js` (tokenize bằng regex
>   ngay trong parser, không tách lexer riêng). Phần phát hiện loại diagram và
>   điều phối (`detectType` / `parse`) nằm trong `src/index.js`.
> - **`core/router.js` → `core/edges.js`.** Vai trò "edge routing" trong kế hoạch
>   được hiện thực bằng `core/edges.js`: chọn cạnh neo theo 4 phía (top/right/
>   bottom/left) và sinh path bezier/orthogonal, dùng chung cho flowchart, class,
>   state, architecture.
> - **Bổ sung ngoài kế hoạch:** `core/history.js` (undo/redo) và `core/virtual.js`
>   (DOM culling cho diagram lớn) — đã có trong lộ trình ở mục 6 & Phase 3/6
>   nhưng thiếu trong sơ đồ file.
