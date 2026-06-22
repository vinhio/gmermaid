/**
 * Renders a BlockAST into SVG: a column grid of shaped blocks (with nested
 * sub-grids) connected by edges.
 * @module diagrams/block/renderer
 */

import { svgEl } from '../../core/renderer.js';
import { connectBoxes } from '../../core/edges.js';

const CW = 120, CH = 56, GAP = 20, PAD = 40; // cell width/height, gap, outer padding
const BPAD = 20, LABEL = 22;                  // composite inner padding + label band

/**
 * Render a BlockAST into the node and edge layers. Clears both first.
 * @param {ReturnType<import('./parser.js').parseBlock>} ast - Parsed block AST.
 * @param {SVGGElement} nodeLayer - Layer receiving block boxes.
 * @param {SVGGElement} edgeLayer - Layer receiving edges.
 * @param {{ attachDrag: Function }} [interact] - Optional drag controller (top-level blocks).
 * @returns {void}
 */
export function renderBlock(ast, nodeLayer, edgeLayer, interact) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();
  ensureMarkers(nodeLayer);
  if (!ast.items.length) return;

  // Layout (relative), then resolve absolute positions onto each block.
  layoutContainer(ast.items, ast.columns, CW);
  (function place(items, ox, oy) {
    for (const it of items) {
      it.x = ox + it._x; it.y = oy + it._y;
      if (it.kind === 'composite') place(it.items, it.x + BPAD, it.y + LABEL + BPAD);
    }
  })(ast.items, PAD, PAD);

  const redraw = () => drawEdges(ast, edgeLayer);
  renderItems(ast, ast.items, nodeLayer, redraw, interact, true);
  redraw();
}

/**
 * Lay out a container's items into a wrapping column grid, assigning each a
 * relative position (`_x`/`_y`) and size (`w`/`h`); recurses into composites.
 * @param {Array<object>} items - Ordered items.
 * @param {number} columns - Column count for this container.
 * @param {number} cellW - Width of one column (px).
 * @returns {{w: number, h: number}} The container's content size.
 */
function layoutContainer(items, columns, cellW) {
  const rows = [];
  let cur = [], col = 0;
  const flush = () => { if (cur.length) rows.push(cur); cur = []; col = 0; };

  for (const it of items) {
    const span = Math.min(it.span || 1, columns);
    if (col > 0 && col + span > columns) flush();
    it._span = span;
    it._colIndex = col;
    it.w = span * cellW + (span - 1) * GAP;
    if (it.kind === 'composite') {
      const innerCols = it.columns || 1;
      const innerCellW = Math.max(60, (it.w - 2 * BPAD - (innerCols - 1) * GAP) / innerCols);
      const sz = layoutContainer(it.items, innerCols, innerCellW);
      it.w = Math.max(it.w, sz.w + 2 * BPAD);
      it.h = sz.h + 2 * BPAD + LABEL;
    } else {
      it.h = CH;
    }
    cur.push(it);
    col += span;
    if (col >= columns) flush();
  }
  flush();

  let y = 0;
  for (const row of rows) {
    const rh = Math.max(...row.map(it => it.h));
    for (const it of row) { it._x = it._colIndex * (cellW + GAP); it._y = y; }
    y += rh + GAP;
  }
  return { w: columns * cellW + (columns - 1) * GAP, h: Math.max(0, y - GAP) };
}

/**
 * Render a list of items (recursing into composites) into the node layer.
 * @param {object} ast - The full AST (for styles).
 * @param {Array<object>} items - Items to render.
 * @param {SVGGElement} layer - Target layer.
 * @param {() => void} redraw - Edge redraw callback (for drag).
 * @param {object} [interact] - Optional drag controller.
 * @param {boolean} topLevel - Whether these items are top-level (draggable).
 * @returns {void}
 */
function renderItems(ast, items, layer, redraw, interact, topLevel) {
  for (const it of items) {
    if (it.kind === 'space') continue;

    if (it.kind === 'composite') {
      const g = svgEl('g', { class: 'gm-block-composite', 'data-id': it.id, transform: `translate(${it.x},${it.y})` });
      g.appendChild(svgEl('rect', { x: 0, y: 0, width: it.w, height: it.h, rx: 8, fill: 'rgba(255,255,255,0.025)', stroke: 'var(--gm-muted)', 'stroke-width': 1, 'stroke-dasharray': '6,4' }));
      g.appendChild(svgEl('text', { x: 10, y: 15, fill: 'var(--gm-muted)', 'font-family': 'var(--gm-font)', 'font-size': 11, 'font-weight': 700, 'pointer-events': 'none' }, it.label || it.id));
      layer.appendChild(g);
      renderItems(ast, it.items, layer, redraw, interact, false);
      continue;
    }

    // Simple block.
    const style = ast.styles[it.id];
    const g = svgEl('g', { class: 'gm-node', 'data-id': it.id, transform: `translate(${it.x},${it.y})` });
    g.appendChild(buildBlockShape(it.shape, it.w, it.h, style, it.dir));
    g.appendChild(svgEl('text', {
      class: 'gm-node-text', x: it.w / 2, y: it.h / 2,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      ...(style?.color ? { fill: style.color } : {}),
    }, it.label));
    if (topLevel && interact) interact.attachDrag(g, it, redraw);
    layer.appendChild(g);
  }
}

/**
 * Build the SVG shape primitive for a block.
 * @param {string} shape - Shape keyword.
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @param {object} [style] - Optional style ({ fill, stroke }).
 * @param {string} [dir] - Block-arrow direction.
 * @returns {SVGElement} The shape element.
 */
function buildBlockShape(shape, w, h, style, dir) {
  const common = {
    class: 'gm-node-shape',
    fill: style?.fill ?? 'var(--gm-node-fill)',
    stroke: style?.stroke ?? 'var(--gm-node-stroke)',
    'stroke-width': 'var(--gm-node-stroke-w)',
  };
  switch (shape) {
    case 'rounded':  return svgEl('rect', { ...common, x: 0, y: 0, width: w, height: h, rx: 12 });
    case 'stadium':  return svgEl('rect', { ...common, x: 0, y: 0, width: w, height: h, rx: h / 2 });
    case 'circle':   return svgEl('ellipse', { ...common, cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 });
    case 'double-circle': {
      const g = svgEl('g');
      g.appendChild(svgEl('ellipse', { ...common, cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 }));
      g.appendChild(svgEl('ellipse', { ...common, fill: 'none', cx: w / 2, cy: h / 2, rx: w / 2 - 4, ry: h / 2 - 4 }));
      return g;
    }
    case 'rhombus': { const mx = w / 2, my = h / 2; return svgEl('polygon', { ...common, points: `${mx},0 ${w},${my} ${mx},${h} 0,${my}` }); }
    case 'hexagon': { const k = Math.min(20, w / 4), my = h / 2; return svgEl('polygon', { ...common, points: `${k},0 ${w-k},0 ${w},${my} ${w-k},${h} ${k},${h} 0,${my}` }); }
    case 'subroutine': return svgEl('path', { ...common, d: `M0,0 h${w} v${h} h-${w} Z M10,0 v${h} M${w-10},0 v${h}` });
    case 'cylinder': { const ry = 8; return svgEl('path', { ...common, d: `M0,${ry} a${w/2},${ry} 0 0 1 ${w},0 L${w},${h-ry} a${w/2},${ry} 0 0 1 -${w},0 Z` }); }
    case 'asymmetric': return svgEl('polygon', { ...common, points: `0,0 ${w-12},0 ${w},${h/2} ${w-12},${h} 0,${h}` });
    case 'parallelogram': { const sk = 16; return svgEl('polygon', { ...common, points: `${sk},0 ${w},0 ${w-sk},${h} 0,${h}` }); }
    case 'block-arrow': {
      // Chevron pointing in `dir`; `x` is double-headed horizontal, `y` vertical.
      const k = 16, my = h / 2, mx = w / 2;
      const d = (dir || 'right').toLowerCase();
      if (d === 'left')  return svgEl('polygon', { ...common, points: `${k},0 ${w},0 ${w},${h} ${k},${h} 0,${my}` });
      if (d === 'up')    return svgEl('polygon', { ...common, points: `0,${k} ${mx},0 ${w},${k} ${w},${h} 0,${h}` });
      if (d === 'down')  return svgEl('polygon', { ...common, points: `0,0 ${w},0 ${w},${h-k} ${mx},${h} 0,${h-k}` });
      if (d === 'x')     return svgEl('polygon', { ...common, points: `0,${my} ${k},0 ${k},${h*0.25} ${w-k},${h*0.25} ${w-k},0 ${w},${my} ${w-k},${h} ${w-k},${h*0.75} ${k},${h*0.75} ${k},${h}` });
      if (d === 'y')     return svgEl('polygon', { ...common, points: `${mx},0 ${w},${k} ${w*0.75},${k} ${w*0.75},${h-k} ${w},${h-k} ${mx},${h} 0,${h-k} ${w*0.25},${h-k} ${w*0.25},${k} 0,${k}` });
      return svgEl('polygon', { ...common, points: `0,0 ${w-k},0 ${w},${my} ${w-k},${h} 0,${h}` }); // right
    }
    default: return svgEl('rect', { ...common, x: 0, y: 0, width: w, height: h, rx: 'var(--gm-node-radius)' });
  }
}

/**
 * Draw all edges into the edge layer, looking up block positions by id.
 * @param {object} ast - The AST (blocks carry x/y/w/h after layout).
 * @param {SVGGElement} edgeLayer - Layer to repopulate.
 * @returns {void}
 */
function drawEdges(ast, edgeLayer) {
  edgeLayer.replaceChildren();
  const byId = new Map(ast.blocks.map(b => [b.id, b]));
  for (const e of ast.edges) {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) continue;
    const { d, mx, my } = connectBoxes({ x: a.x, y: a.y, w: a.w, h: a.h }, { x: b.x, y: b.y, w: b.w, h: b.h }, true);
    const path = svgEl('path', { class: 'gm-edge', d, fill: 'none', stroke: 'var(--gm-edge)', 'stroke-width': 1.5 });
    if (e.arrow === 'line') { /* no head */ }
    else if (e.arrow === 'cross')  path.setAttribute('marker-end', 'url(#gm-blk-cross)');
    else if (e.arrow === 'circle') path.setAttribute('marker-end', 'url(#gm-blk-circle)');
    else { path.setAttribute('marker-end', 'url(#gm-blk-arrow)'); if (e.arrow === 'bi') path.setAttribute('marker-start', 'url(#gm-blk-arrow)'); }
    edgeLayer.appendChild(path);
    if (e.label) {
      edgeLayer.appendChild(svgEl('rect', { x: mx - e.label.length * 3.2 - 4, y: my - 9, width: e.label.length * 6.4 + 8, height: 16, rx: 3, fill: 'var(--gm-panel)' }));
      edgeLayer.appendChild(svgEl('text', { class: 'gm-edge-label', x: mx, y: my + 3, 'text-anchor': 'middle' }, e.label));
    }
  }
}

/**
 * Inject the block edge-head markers (arrow, circle, cross) into the SVG defs once.
 * @param {SVGElement} nodeLayer - A layer whose owning SVG receives the markers.
 * @returns {void}
 */
function ensureMarkers(nodeLayer) {
  const svg = nodeLayer.closest('svg') ?? nodeLayer.ownerSVGElement;
  if (!svg || svg.querySelector('#gm-blk-arrow')) return;
  let defs = svg.querySelector('defs');
  if (!defs) { defs = svgEl('defs'); svg.insertBefore(defs, svg.firstChild); }

  const arrow = svgEl('marker', { id: 'gm-blk-arrow', markerWidth: 10, markerHeight: 7, refX: 9, refY: 3.5, orient: 'auto-start-reverse' });
  arrow.appendChild(svgEl('path', { d: 'M0,0 L10,3.5 L0,7 Z', fill: 'var(--gm-edge)' }));
  defs.appendChild(arrow);
  const circle = svgEl('marker', { id: 'gm-blk-circle', markerWidth: 11, markerHeight: 11, refX: 9, refY: 5.5, orient: 'auto' });
  circle.appendChild(svgEl('circle', { cx: 5.5, cy: 5.5, r: 4.5, fill: 'var(--gm-panel)', stroke: 'var(--gm-edge)', 'stroke-width': 1.5 }));
  defs.appendChild(circle);
  const cross = svgEl('marker', { id: 'gm-blk-cross', markerWidth: 12, markerHeight: 12, refX: 9, refY: 6, orient: 'auto' });
  cross.appendChild(svgEl('path', { d: 'M2,2 L10,10 M10,2 L2,10', stroke: 'var(--gm-edge)', 'stroke-width': 1.6 }));
  defs.appendChild(cross);
}
