/**
 * Renders a C4AST into SVG: elements as boxes on a grid, relationships as arrows.
 * @module diagrams/c4/renderer
 */

import { svgEl } from '../../core/renderer.js';

const BOX_W  = 160; // Element box width.
const BOX_H  = 100; // Element box height.
const CELL_GAP = 36; // Gap between items inside a container.
const COLS   = 3;   // Elements per row before wrapping.
const PAD    = 40;  // Outer padding.
const B_PAD  = 22;  // Inner padding inside a boundary box.
const B_LABEL = 26; // Boundary header/label band height.

// Fill colour per element kind; external elements override with EXT_COLOR.
const KIND_COLOR = {
  person:    'oklch(0.38 0.10 220)',
  system:    'oklch(0.38 0.12 220)',
  container: 'oklch(0.38 0.13 200)',
  component: 'oklch(0.38 0.10 155)',
};
const EXT_COLOR = 'oklch(0.32 0.04 0)';

/**
 * Picks the fill colour for an element box.
 * @param {{ ext: boolean, kind: string }} el - C4 element.
 * @returns {string} OKLCH colour string (grey for external elements).
 */
function boxColor(el) {
  return el.ext ? EXT_COLOR : (KIND_COLOR[el.kind] ?? KIND_COLOR.system);
}

/**
 * Renders a C4AST into the node and edge layers. Clears both layers first.
 *
 * Elements are laid out left-to-right, wrapping every {@link COLS} columns;
 * relationship arrows connect box centres, doubled for bidirectional `BiRel`.
 *
 * @param {ReturnType<import('./parser.js').parseC4>} ast - Parsed C4 AST.
 * @param {SVGGElement} nodeLayer - SVG group receiving element boxes.
 * @param {SVGGElement} edgeLayer - SVG group for edges (cleared; relationships drawn in nodeLayer).
 * @returns {void}
 */
export function renderC4(ast, nodeLayer, edgeLayer) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();

  const { title, elements, boundaries = [], rels } = ast;
  if (!elements.length && !boundaries.length && !rels.length) return;

  const titleOff = title ? 50 : 10;
  const elsByParent  = groupByParent(elements);
  const bndsByParent = groupByParent(boundaries);

  // Phase 1 — recursive sizing: lay out each container's items (elements + nested
  // boundaries) into a wrapping grid, recording local positions and box sizes.
  function layoutContainer(pid) {
    const els  = elsByParent.get(pid)  ?? [];
    const subs = bndsByParent.get(pid) ?? [];
    for (const b of subs) { const sz = layoutContainer(b.id); b._w = sz.w; b._h = sz.h; }
    const items = [
      ...els.map(e => ({ ref: e, w: BOX_W, h: BOX_H })),
      ...subs.map(b => ({ ref: b, w: b._w, h: b._h })),
    ];
    const left = pid === null ? PAD : B_PAD;
    const top  = pid === null ? titleOff : B_LABEL + B_PAD;
    let x = left, y = top, rowH = 0, col = 0, maxR = left, maxB = top;
    for (const it of items) {
      it.ref._lx = x; it.ref._ly = y;
      maxR = Math.max(maxR, x + it.w); maxB = Math.max(maxB, y + it.h);
      x += it.w + CELL_GAP; rowH = Math.max(rowH, it.h);
      if (++col >= COLS) { col = 0; x = left; y += rowH + CELL_GAP; rowH = 0; }
    }
    const padR = pid === null ? PAD : B_PAD;
    return { w: maxR + padR, h: maxB + padR };
  }
  const rootSize = layoutContainer(null);

  // Phase 2 — absolute positions by accumulating offsets down the tree.
  (function place(pid, ox, oy) {
    for (const e of (elsByParent.get(pid)  ?? [])) { e.x = ox + e._lx; e.y = oy + e._ly; }
    for (const b of (bndsByParent.get(pid) ?? [])) { b.x = ox + b._lx; b.y = oy + b._ly; place(b.id, b.x, b.y); }
  })(null, 0, 0);

  // Combined id → box lookup (elements and boundaries) for relationship endpoints.
  const boxById = new Map();
  for (const e of elements)   boxById.set(e.id, { x: e.x, y: e.y, w: BOX_W, h: BOX_H });
  for (const b of boundaries) boxById.set(b.id, { x: b.x, y: b.y, w: b._w, h: b._h });

  const g = svgEl('g');

  // Arrow marker
  const defs = svgEl('defs');
  const marker = svgEl('marker', { id: 'c4-arr', markerWidth: '10', markerHeight: '7', refX: '9', refY: '3.5', orient: 'auto' });
  marker.appendChild(svgEl('polygon', { points: '0 0,10 3.5,0 7', fill: 'var(--gm-edge)' }));
  defs.appendChild(marker);
  g.appendChild(defs);

  // Title
  if (title) {
    g.appendChild(svgEl('text', {
      class: 'gm-c4-title',
      x: rootSize.w / 2, y: 26,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    }, title));
  }

  // Boundary frames (outermost first so nested ones paint on top).
  const byDepth = [...boundaries].sort((a, b) => boundaryDepth(a, boundaries) - boundaryDepth(b, boundaries));
  for (const b of byDepth) {
    g.appendChild(svgEl('rect', {
      class: 'gm-c4-boundary', x: b.x, y: b.y, width: b._w, height: b._h, rx: 8,
      fill: 'rgba(255,255,255,0.025)', stroke: 'var(--gm-muted)', 'stroke-width': 1, 'stroke-dasharray': '6,4',
    }));
    if (b.label) {
      g.appendChild(svgEl('text', {
        class: 'gm-c4-boundary-label', x: b.x + 12, y: b.y + 16,
        fill: 'var(--gm-muted)', 'font-family': 'var(--gm-label-font)', 'font-size': 12, 'font-weight': 700, 'pointer-events': 'none',
      }, b.kind && b.kind !== 'boundary' ? `${b.label}  [${b.kind}]` : b.label));
    }
  }

  // Relationships
  for (const rel of rels) {
    const fp = boxById.get(rel.from);
    const tp = boxById.get(rel.to);
    if (!fp || !tp) continue;

    const fx = fp.x + fp.w / 2, fy = fp.y + fp.h / 2;
    const tx = tp.x + tp.w / 2, ty = tp.y + tp.h / 2;

    g.appendChild(svgEl('line', {
      class: 'gm-c4-rel',
      x1: fx, y1: fy, x2: tx, y2: ty,
      stroke: 'var(--gm-edge)',
      'stroke-width': '1.5',
      'marker-end': 'url(#c4-arr)',
    }));

    if (rel.bidir) {
      g.appendChild(svgEl('line', {
        class: 'gm-c4-rel',
        x1: tx, y1: ty, x2: fx, y2: fy,
        stroke: 'var(--gm-edge)',
        'stroke-width': '1.5',
        'marker-end': 'url(#c4-arr)',
      }));
    }

    if (rel.label) {
      g.appendChild(svgEl('text', {
        class: 'gm-c4-rel-label',
        x: (fx + tx) / 2, y: (fy + ty) / 2 - 7,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      }, rel.label));
    }
  }

  // Elements
  for (const el of elements) {
    const color = boxColor(el);
    const elG = svgEl('g', { transform: `translate(${el.x},${el.y})` });

    if (el.kind === 'person') {
      // Person is drawn as a stick-figure-ish head circle above a body rect.
      // Circle head
      elG.appendChild(svgEl('circle', { cx: BOX_W / 2, cy: 18, r: 16, fill: color }));
      // Body rect (offset down to clear the head, hence reduced height).
      elG.appendChild(svgEl('rect', { class: 'gm-c4-box', x: 0, y: 30, width: BOX_W, height: BOX_H - 30, fill: color, rx: 6 }));
    } else {
      elG.appendChild(svgEl('rect', { class: 'gm-c4-box', x: 0, y: 0, width: BOX_W, height: BOX_H, fill: color, rx: 6 }));
    }

    const textY0 = el.kind === 'person' ? 42 : 14;
    const lineH = 14;
    let ty = textY0;

    // [Kind] label
    elG.appendChild(svgEl('text', {
      class: 'gm-c4-kind',
      x: BOX_W / 2, y: ty,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
    }, `[${el.kind.charAt(0).toUpperCase() + el.kind.slice(1)}]`));
    ty += lineH;

    // Main label
    const mainLabel = el.label.length > 20 ? el.label.slice(0, 19) + '…' : el.label;
    elG.appendChild(svgEl('text', {
      class: 'gm-c4-label',
      x: BOX_W / 2, y: ty,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
    }, mainLabel));
    ty += lineH;

    if (el.tech) {
      elG.appendChild(svgEl('text', {
        class: 'gm-c4-tech',
        x: BOX_W / 2, y: ty,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
      }, `[${el.tech}]`));
      ty += lineH;
    }

    if (el.desc) {
      const desc = el.desc.length > 22 ? el.desc.slice(0, 21) + '…' : el.desc;
      elG.appendChild(svgEl('text', {
        class: 'gm-c4-desc',
        x: BOX_W / 2, y: ty,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
      }, desc));
    }

    g.appendChild(elG);
  }

  nodeLayer.appendChild(g);
}

/**
 * Group nodes by their `parent` id (null = top level).
 * @param {Array<{parent: string|null}>} nodes - Elements or boundaries.
 * @returns {Map<string|null, Array>} parent id -> nodes.
 */
function groupByParent(nodes) {
  const m = new Map();
  for (const n of nodes) {
    const k = n.parent ?? null;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(n);
  }
  return m;
}

/**
 * Compute a boundary's nesting depth (number of ancestor boundaries).
 * @param {{parent: string|null}} b - The boundary.
 * @param {Array<{id: string, parent: string|null}>} all - All boundaries.
 * @returns {number} Depth (0 = top level).
 */
function boundaryDepth(b, all) {
  let d = 0, p = b.parent;
  while (p) { const par = all.find(x => x.id === p); if (!par) break; d++; p = par.parent; }
  return d;
}
