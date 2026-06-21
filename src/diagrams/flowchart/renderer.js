/**
 * Flowchart renderer: draws a FlowchartAST into SVG, appending node `<g>`
 * elements to nodeLayer and edge paths to edgeLayer. Never re-parses; reads
 * geometry straight from the AST and styles via `var(--gm-*)` CSS variables.
 */

import { svgEl } from '../../core/renderer.js';
import { connectBoxes } from '../../core/edges.js';

const NODE_W = 140; // default node width  (px)
const NODE_H = 44;  // default node height (px)

/**
 * Render a flowchart AST into the given SVG layers.
 * @param {object} ast - FlowchartAST from parseFlowchart ({ nodes, edges, direction }).
 * @param {SVGElement} nodeLayer - Group element that receives node shapes.
 * @param {SVGElement} edgeLayer - Group element that receives edge paths.
 * @param {{ attachDrag: Function }} interact - Interaction helper providing drag wiring.
 * @param {boolean} [curved=true] - Whether edges use Bézier curves (vs. orthogonal lines).
 * @returns {void}
 */
export function renderFlowchart(ast, nodeLayer, edgeLayer, interact, curved = true) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();

  for (const node of ast.nodes) {
    const g = buildNode(node);
    nodeLayer.appendChild(g);
    interact.attachDrag(g, node, () => redrawEdges(ast, edgeLayer, curved));
  }

  redrawEdges(ast, edgeLayer, curved);
}

/**
 * Build a node `<g>` containing its shape and centered label text.
 * @param {object} node - Node AST entry ({ id, label, shape, style, x, y, w, h }).
 * @returns {SVGGElement} The positioned node group.
 */
function buildNode(node) {
  const { id, label, shape, style } = node;
  const w = node.w ?? NODE_W;
  const h = node.h ?? NODE_H;

  const g = svgEl('g', { class: 'gm-node', 'data-id': id, transform: `translate(${node.x},${node.y})` });
  g.appendChild(buildShape(shape, w, h, style));

  const txt = svgEl('text', {
    class: 'gm-node-text',
    x: w / 2, y: h / 2,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
  }, label);
  g.appendChild(txt);

  return g;
}

/**
 * Build the SVG primitive for a node shape, honoring any inline style overrides.
 * @param {string} shape - Shape keyword (diamond, circle, round, cylinder, etc.).
 * @param {number} w - Node width in px.
 * @param {number} h - Node height in px.
 * @param {object} [style] - Optional style overrides (fill, stroke, stroke-width).
 * @returns {SVGElement} The shape element.
 */
function buildShape(shape, w, h, style) {
  const fill   = style?.fill   ?? 'var(--gm-node-fill)';
  const stroke = style?.stroke ?? 'var(--gm-node-stroke)';
  const sw     = style?.['stroke-width'] ?? 'var(--gm-node-stroke-w)';
  const common = { class: 'gm-node-shape', fill, stroke, 'stroke-width': sw };

  switch (shape) {
    case 'diamond': {
      // Rhombus: vertices at top, right, bottom, left midpoints.
      const mx = w / 2, my = h / 2;
      return svgEl('polygon', { ...common, points: `${mx},0 ${w},${my} ${mx},${h} 0,${my}` });
    }
    case 'circle':
      return svgEl('ellipse', { ...common, cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 });
    case 'round':
      // Rect with corner radius = half height (pill ends).
      return svgEl('rect', { ...common, x: 0, y: 0, width: w, height: h, rx: h / 2 });
    case 'cylinder': {
      // Database can: top ellipse arc, straight sides, bottom ellipse arc.
      const ry = 8;
      return svgEl('path', { ...common,
        d: `M0,${ry} a${w/2},${ry} 0 0 1 ${w},0 L${w},${h-ry} a${w/2},${ry} 0 0 1 -${w},0 Z` });
    }
    case 'parallelogram': {
      // Slant top and bottom edges by `sk` px to skew the rectangle.
      const sk = 16;
      return svgEl('polygon', { ...common, points: `${sk},0 ${w},0 ${w-sk},${h} 0,${h}` });
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

    // Four-sided routing: each endpoint anchors to whichever box side (top/
    // right/bottom/left) faces the other node, so vertical layouts connect
    // bottom→top and horizontal layouts connect right→left.
    const A = { x: a.x, y: a.y, w: a.w ?? NODE_W, h: a.h ?? NODE_H };
    const B = { x: b.x, y: b.y, w: b.w ?? NODE_W, h: b.h ?? NODE_H };
    const { d, mx, my } = connectBoxes(A, B, curved);

    const isArrow  = !edge.type || edge.type === 'arrow' || edge.type === 'thick';
    const isDotted = edge.type === 'dotted';
    const isThick  = edge.type === 'thick';

    const pathAttrs = {
      class: 'gm-edge', d, fill: 'none',
      stroke: 'var(--gm-edge)',
      'stroke-width': isThick ? '2.5' : '1.5',
    };
    if (isDotted) pathAttrs['stroke-dasharray'] = '5,4';
    if (isArrow)  pathAttrs['marker-end'] = 'url(#gm-arrow)';

    const g = svgEl('g', { class: 'gm-edge-group', 'data-from': edge.from, 'data-to': edge.to });
    g.appendChild(svgEl('path', pathAttrs));

    if (edge.label) {
      g.appendChild(svgEl('rect', { x: mx-30, y: my-10, width: 60, height: 18, rx: 4, fill: 'var(--gm-panel)' }));
      g.appendChild(svgEl('text', { class: 'gm-edge-label', x: mx, y: my+4, 'text-anchor': 'middle' }, edge.label));
    }

    edgeLayer.appendChild(g);
  }
}
