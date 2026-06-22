/**
 * Flowchart renderer: draws a FlowchartAST into SVG, appending node `<g>`
 * elements to nodeLayer and edge paths to edgeLayer. Never re-parses; reads
 * geometry straight from the AST and styles via `var(--gm-*)` CSS variables.
 * Supports the full documented shape set, link styles/heads, multi-line (`<br>`)
 * labels, and draggable subgraph containers.
 */

import { svgEl } from '../../core/renderer.js';
import { connectBoxes } from '../../core/edges.js';
import { splitBr } from './parser.js';

const NODE_W = 140; // fallback node width  (px)
const NODE_H = 44;  // fallback node height (px)
const SG_PAD   = 24; // subgraph inner padding (px)
const SG_LABEL = 26; // subgraph header/label band height (px)

/**
 * Render a flowchart AST into the given SVG layers.
 * @param {object} ast - FlowchartAST from parseFlowchart ({ nodes, edges, direction, subgraphs }).
 * @param {SVGElement} nodeLayer - Group element that receives node shapes.
 * @param {SVGElement} edgeLayer - Group element that receives edge paths.
 * @param {{ attachDrag: Function }} interact - Interaction helper providing drag wiring.
 * @param {boolean} [curved=true] - Whether edges use Bézier curves (vs. orthogonal lines).
 * @returns {void}
 */
export function renderFlowchart(ast, nodeLayer, edgeLayer, interact, curved = true) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();
  ensureFlowMarkers(nodeLayer);

  const nodeMap = new Map(ast.nodes.map(n => [n.id, n]));
  const groupEls = {};
  const redraw = () => redrawEdges(ast, edgeLayer, curved);

  // Subgraph frames (draggable by their header) — drawn first so they sit behind.
  for (const sg of (ast.subgraphs ?? [])) {
    if (!sg.nodes.some(id => nodeMap.has(id))) continue;
    nodeLayer.appendChild(buildSubgraphGroup(sg, nodeMap, groupEls, interact, redraw));
  }

  for (const node of ast.nodes) {
    const g = buildNode(node);
    nodeLayer.appendChild(g);
    groupEls[node.id] = g;
    interact.attachDrag(g, node, redraw);
  }

  redraw();
}

/**
 * Build a node `<g>` containing its shape and centered (possibly multi-line) label.
 * @param {object} node - Node AST entry ({ id, label, shape, style, x, y, w, h }).
 * @returns {SVGGElement} The positioned node group.
 */
function buildNode(node) {
  const { id, label, shape, style } = node;
  const w = node.w || NODE_W;
  const h = node.h || NODE_H;

  const g = svgEl('g', { class: 'gm-node', 'data-id': id, transform: `translate(${node.x},${node.y})` });
  g.appendChild(buildShape(shape, w, h, style));

  const lines = splitBr(label);
  const txt = svgEl('text', {
    class: 'gm-node-text',
    x: w / 2, y: h / 2,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
  });
  const startDy = -((lines.length - 1) * 9); // center the block of lines vertically
  lines.forEach((ln, idx) => txt.appendChild(svgEl('tspan', { x: w / 2, dy: idx === 0 ? startDy : 18 }, ln)));
  g.appendChild(txt);

  return g;
}

/**
 * Build the SVG primitive for a node shape, honoring any inline style overrides.
 * @param {string} shape - Shape keyword.
 * @param {number} w - Node width in px.
 * @param {number} h - Node height in px.
 * @param {object} [style] - Optional style overrides (fill, stroke, stroke-width).
 * @returns {SVGElement} The shape element (or a group for compound shapes).
 */
function buildShape(shape, w, h, style) {
  const fill   = style?.fill   ?? 'var(--gm-node-fill)';
  const stroke = style?.stroke ?? 'var(--gm-node-stroke)';
  const sw     = style?.['stroke-width'] ?? 'var(--gm-node-stroke-w)';
  const common = { class: 'gm-node-shape', fill, stroke, 'stroke-width': sw };

  switch (shape) {
    case 'diamond': {
      const mx = w / 2, my = h / 2;
      return svgEl('polygon', { ...common, points: `${mx},0 ${w},${my} ${mx},${h} 0,${my}` });
    }
    case 'hexagon': {
      // Flat-top hexagon: angled left/right edges inset by `k`.
      const k = Math.min(20, w / 4), my = h / 2;
      return svgEl('polygon', { ...common, points: `${k},0 ${w-k},0 ${w},${my} ${w-k},${h} ${k},${h} 0,${my}` });
    }
    case 'circle':
      return svgEl('ellipse', { ...common, cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 });
    case 'double-circle': {
      const g = svgEl('g');
      g.appendChild(svgEl('ellipse', { ...common, cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 }));
      g.appendChild(svgEl('ellipse', { ...common, fill: 'none', cx: w / 2, cy: h / 2, rx: w / 2 - 4, ry: h / 2 - 4 }));
      return g;
    }
    case 'stadium':
      // Full pill (semicircular ends).
      return svgEl('rect', { ...common, x: 0, y: 0, width: w, height: h, rx: h / 2 });
    case 'round':
      return svgEl('rect', { ...common, x: 0, y: 0, width: w, height: h, rx: 12 });
    case 'cylinder': {
      const ry = 8;
      return svgEl('path', { ...common,
        d: `M0,${ry} a${w/2},${ry} 0 0 1 ${w},0 L${w},${h-ry} a${w/2},${ry} 0 0 1 -${w},0 Z` });
    }
    case 'parallelogram': {
      const sk = 16;
      return svgEl('polygon', { ...common, points: `${sk},0 ${w},0 ${w-sk},${h} 0,${h}` });
    }
    case 'parallelogram-alt': {
      const sk = 16;
      return svgEl('polygon', { ...common, points: `0,0 ${w-sk},0 ${w},${h} ${sk},${h}` });
    }
    case 'trapezoid': {
      // Wider bottom (`[/text\]`).
      const sk = 16;
      return svgEl('polygon', { ...common, points: `${sk},0 ${w-sk},0 ${w},${h} 0,${h}` });
    }
    case 'trapezoid-alt': {
      // Wider top (`[\text/]`).
      const sk = 16;
      return svgEl('polygon', { ...common, points: `0,0 ${w},0 ${w-sk},${h} ${sk},${h}` });
    }
    case 'asymmetric':
      return svgEl('polygon', { ...common, points: `0,0 ${w-12},0 ${w},${h/2} ${w-12},${h} 0,${h}` });
    case 'subroutine':
      return svgEl('path', { ...common,
        d: `M0,0 h${w} v${h} h-${w} Z M12,0 v${h} M${w-12},0 v${h}` });
    default:
      return svgEl('rect', { ...common, x: 0, y: 0, width: w, height: h, rx: 'var(--gm-node-radius)' });
  }
}

/**
 * Build a draggable subgraph frame: a dashed body outline plus a filled header
 * bar (the drag handle). Dragging the header moves the whole subgraph and every
 * member node with it.
 * @param {object} sg - The subgraph ({ id, title, nodes }).
 * @param {Map<string, object>} nodeMap - Node id -> node lookup.
 * @param {Object<string, SVGGElement>} groupEls - Node id -> rendered group (filled in by the caller).
 * @param {{ attachDrag: Function }} interact - Interaction helper.
 * @param {() => void} redraw - Edge-redraw callback.
 * @returns {SVGGElement} The subgraph group.
 */
function buildSubgraphGroup(sg, nodeMap, groupEls, interact, redraw) {
  const members = sg.nodes.map(id => nodeMap.get(id)).filter(Boolean);
  // Fit the box around the current member positions (tracks earlier drags).
  sg.x = Math.min(...members.map(m => m.x)) - SG_PAD;
  sg.y = Math.min(...members.map(m => m.y)) - SG_LABEL - SG_PAD;
  sg.w = Math.max(...members.map(m => m.x + m.w)) + SG_PAD - sg.x;
  sg.h = Math.max(...members.map(m => m.y + m.h)) + SG_PAD - sg.y;

  const g = svgEl('g', { class: 'gm-subgraph', 'data-id': `sg:${sg.id}`, transform: `translate(${sg.x},${sg.y})` });
  g.appendChild(svgEl('rect', {
    x: 0, y: 0, width: sg.w, height: sg.h, rx: 8,
    fill: 'none', stroke: 'var(--gm-muted)', 'stroke-width': 1, 'stroke-dasharray': '6,4',
  }));
  const title = sg.title || sg.id;
  const labelW = Math.min(sg.w, Math.max(60, title.length * 7 + 24));
  g.appendChild(svgEl('rect', {
    class: 'gm-subgraph-handle', x: 0, y: 0, width: labelW, height: SG_LABEL, rx: 8,
    fill: 'var(--gm-header)', stroke: 'var(--gm-muted)', 'stroke-width': 1,
  }));
  g.appendChild(svgEl('text', {
    x: 10, y: SG_LABEL / 2 + 4, fill: 'var(--gm-muted)',
    'font-family': 'var(--gm-font)', 'font-size': 11, 'font-weight': 700, 'pointer-events': 'none',
  }, title));

  const nsState = { id: `sg:${sg.id}`, x: sg.x, y: sg.y };
  let lastX = sg.x, lastY = sg.y;
  interact.attachDrag(g, nsState, st => {
    const dx = st.x - lastX, dy = st.y - lastY;
    lastX = st.x; lastY = st.y;
    for (const m of members) {
      m.x += dx; m.y += dy;
      groupEls[m.id]?.setAttribute('transform', `translate(${m.x},${m.y})`);
    }
    redraw();
  });

  return g;
}

/**
 * Clear and redraw all edges. Called on initial render and after each node drag.
 * @param {object} ast - FlowchartAST with up-to-date node positions.
 * @param {SVGElement} edgeLayer - Group element to repopulate with edge paths.
 * @param {boolean} curved - Whether to draw Bézier curves vs. orthogonal lines.
 * @returns {void}
 */
function redrawEdges(ast, edgeLayer, curved) {
  edgeLayer.replaceChildren();
  const nodeMap = new Map(ast.nodes.map(n => [n.id, n]));

  for (const edge of ast.edges) {
    const a = nodeMap.get(edge.from);
    const b = nodeMap.get(edge.to);
    if (!a || !b) continue;

    // Four-sided routing: each endpoint anchors to whichever box side faces the
    // other node.
    const A = { x: a.x, y: a.y, w: a.w || NODE_W, h: a.h || NODE_H };
    const B = { x: b.x, y: b.y, w: b.w || NODE_W, h: b.h || NODE_H };
    const { d, mx, my } = connectBoxes(A, B, curved);

    const pathAttrs = {
      class: 'gm-edge', d, fill: 'none',
      stroke: 'var(--gm-edge)',
      'stroke-width': edge.line === 'thick' ? '2.5' : '1.5',
    };
    if (edge.line === 'dotted') pathAttrs['stroke-dasharray'] = '5,4';
    const startMarker = headMarker(edge.startHead);
    const endMarker   = headMarker(edge.endHead);
    if (startMarker) pathAttrs['marker-start'] = startMarker;
    if (endMarker)   pathAttrs['marker-end']   = endMarker;

    const g = svgEl('g', { class: 'gm-edge-group', 'data-from': edge.from, 'data-to': edge.to });
    g.appendChild(svgEl('path', pathAttrs));

    if (edge.label) {
      const tw = edge.label.length * 6.5 + 12;
      g.appendChild(svgEl('rect', { x: mx - tw / 2, y: my - 10, width: tw, height: 18, rx: 4, fill: 'var(--gm-panel)' }));
      g.appendChild(svgEl('text', { class: 'gm-edge-label', x: mx, y: my + 4, 'text-anchor': 'middle' }, edge.label));
    }

    edgeLayer.appendChild(g);
  }
}

/**
 * Map an edge head kind to its SVG marker URL.
 * @param {string|null} head - 'arrow' | 'circle' | 'cross' | null.
 * @returns {string|null} A `url(#...)` reference, or null for no head.
 */
function headMarker(head) {
  switch (head) {
    case 'arrow':  return 'url(#gm-fc-arrow)';
    case 'circle': return 'url(#gm-fc-circle)';
    case 'cross':  return 'url(#gm-fc-cross)';
    default:       return null;
  }
}

/**
 * Inject the flowchart edge-head markers (arrow, circle, cross) into the SVG's
 * defs once. Each uses `auto-start-reverse` so it can sit at either end.
 * @param {SVGElement} nodeLayer - A layer whose owning SVG receives the markers.
 * @returns {void}
 */
function ensureFlowMarkers(nodeLayer) {
  const svg = nodeLayer.closest('svg') ?? nodeLayer.ownerSVGElement;
  if (!svg || svg.querySelector('#gm-fc-arrow')) return;
  let defs = svg.querySelector('defs');
  if (!defs) { defs = svgEl('defs'); svg.insertBefore(defs, svg.firstChild); }

  const arrow = svgEl('marker', { id: 'gm-fc-arrow', markerWidth: 10, markerHeight: 7, refX: 9, refY: 3.5, orient: 'auto-start-reverse' });
  arrow.appendChild(svgEl('path', { d: 'M0,0 L10,3.5 L0,7 Z', fill: 'var(--gm-edge)' }));
  defs.appendChild(arrow);

  const circle = svgEl('marker', { id: 'gm-fc-circle', markerWidth: 11, markerHeight: 11, refX: 9, refY: 5.5, orient: 'auto-start-reverse' });
  circle.appendChild(svgEl('circle', { cx: 5.5, cy: 5.5, r: 4.5, fill: 'var(--gm-panel)', stroke: 'var(--gm-edge)', 'stroke-width': 1.5 }));
  defs.appendChild(circle);

  const cross = svgEl('marker', { id: 'gm-fc-cross', markerWidth: 12, markerHeight: 12, refX: 9, refY: 6, orient: 'auto-start-reverse' });
  cross.appendChild(svgEl('path', { d: 'M2,2 L10,10 M10,2 L2,10', stroke: 'var(--gm-edge)', 'stroke-width': 1.6 }));
  defs.appendChild(cross);
}
