/**
 * Renders a C4AST into SVG: elements as boxes on a grid, relationships as arrows.
 * @module diagrams/c4/renderer
 */

import { svgEl } from '../../core/renderer.js';

const BOX_W  = 160; // Element box width.
const BOX_H  = 100; // Element box height.
const H_GAP  = 60;  // Horizontal gap between grid columns.
const V_GAP  = 60;  // Vertical gap between grid rows.
const COLS   = 3;   // Elements per row before wrapping.
const PAD    = 40;  // Outer padding.

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

  const { title, elements, rels } = ast;
  if (!elements.length && !rels.length) return;

  // Reserve vertical space for the title, then place each element on the grid.
  const titleOff = title ? 50 : 10;
  const positions = new Map();
  for (let i = 0; i < elements.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    positions.set(elements[i].id, {
      x: PAD + col * (BOX_W + H_GAP),
      y: titleOff + row * (BOX_H + V_GAP),
    });
  }

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
      x: PAD + (COLS * (BOX_W + H_GAP)) / 2, y: 26,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    }, title));
  }

  // Relationships
  for (const rel of rels) {
    const fp = positions.get(rel.from);
    const tp = positions.get(rel.to);
    if (!fp || !tp) continue;

    const fx = fp.x + BOX_W / 2, fy = fp.y + BOX_H / 2;
    const tx = tp.x + BOX_W / 2, ty = tp.y + BOX_H / 2;

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
    const pos = positions.get(el.id);
    if (!pos) continue;
    const color = boxColor(el);
    const elG = svgEl('g', { transform: `translate(${pos.x},${pos.y})` });

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
