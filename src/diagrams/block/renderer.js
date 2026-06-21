/**
 * Renders a BlockAST into SVG: grid-positioned block boxes with curved edges.
 * @module diagrams/block/renderer
 */

import { svgEl } from '../../core/renderer.js';

const CW = 120, CH = 56, GAP = 20, PAD = 40; // Cell width/height, inter-cell gap, outer padding.

/**
 * Builds a `<defs>` containing a reusable arrowhead marker for edges.
 * @param {string} id - Marker id referenced via `url(#id)`.
 * @returns {SVGDefsElement} Defs element holding the marker.
 */
function marker(id) {
  const defs = svgEl('defs');
  const m = svgEl('marker', { id, markerWidth: '10', markerHeight: '7', refX: '9', refY: '3.5', orient: 'auto' });
  m.appendChild(svgEl('polygon', { points: '0 0,10 3.5,0 7', fill: 'var(--gm-edge)' }));
  defs.appendChild(m);
  return defs;
}

/**
 * Draws all block edges into the edge layer, replacing its prior contents.
 * Each edge is a vertical S-curve from the source block's bottom centre to the
 * target block's top centre, so it re-flows correctly when blocks are dragged.
 * @param {ReturnType<import('./parser.js').parseBlock>} ast - AST whose blocks already have x/y/w/h set.
 * @param {SVGGElement} edgeLayer - SVG group receiving the edge paths.
 * @returns {void}
 */
function drawEdges(ast, edgeLayer) {
  edgeLayer.replaceChildren();
  edgeLayer.appendChild(marker('blk-arr'));
  for (const e of ast.edges) {
    const bf = ast.blocks.find(b => b.id === e.from);
    const bt = ast.blocks.find(b => b.id === e.to);
    if (!bf || !bt) continue;
    // From bottom-centre of source to top-centre of target; my is the curve's mid-Y.
    const fx = bf.x + bf.w / 2, fy = bf.y + bf.h;
    const tx = bt.x + bt.w / 2, ty = bt.y;
    const my = (fy + ty) / 2;
    edgeLayer.appendChild(svgEl('path', {
      class: 'gm-edge',
      d: `M${fx},${fy} C${fx},${my} ${tx},${my} ${tx},${ty}`,
      'marker-end': 'url(#blk-arr)',
    }));
    if (e.label) {
      edgeLayer.appendChild(svgEl('text', { class: 'gm-edge-label', x: (fx+tx)/2, y: my-6, 'text-anchor': 'middle' }, e.label));
    }
  }
}

/**
 * Renders a BlockAST into the node and edge layers. Clears both layers first.
 *
 * Computes each block's pixel geometry from its grid coordinates (a multi-column
 * span widens the box and absorbs the intervening gaps), draws the edges, then
 * draws each block box. When `interact` is supplied, boxes become draggable and
 * edges are redrawn live on drag.
 *
 * @param {ReturnType<import('./parser.js').parseBlock>} ast - Parsed block AST (mutated with x/y/w/h).
 * @param {SVGGElement} nodeLayer - SVG group receiving block boxes.
 * @param {SVGGElement} edgeLayer - SVG group receiving edges.
 * @param {{ attachDrag: (g: SVGGElement, model: object, onMove: () => void) => void }} [interact] - Optional drag controller.
 * @returns {void}
 */
export function renderBlock(ast, nodeLayer, edgeLayer, interact) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();
  const { blocks } = ast;
  if (!blocks.length) return;

  // Convert grid coords to pixels; a span>1 box widens and swallows inner gaps.
  for (const b of blocks) {
    b.x = PAD + b.col * (CW + GAP);
    b.y = PAD + b.row * (CH + GAP);
    b.w = b.span * CW + (b.span - 1) * GAP;
    b.h = CH;
  }

  drawEdges(ast, edgeLayer);

  for (const b of blocks) {
    const g = svgEl('g', { class: 'gm-node', 'data-id': b.id, transform: `translate(${b.x},${b.y})` });
    g.appendChild(svgEl('rect', {
      class: 'gm-node-shape',
      x: 0, y: 0, width: b.w, height: b.h,
      fill: 'var(--gm-node-fill)', stroke: 'var(--gm-node-stroke)',
      'stroke-width': 'var(--gm-node-stroke-w)', rx: 'var(--gm-node-radius)',
    }));
    g.appendChild(svgEl('text', {
      class: 'gm-node-text',
      x: b.w / 2, y: b.h / 2,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
    }, b.label));
    if (interact) interact.attachDrag(g, b, () => drawEdges(ast, edgeLayer));
    nodeLayer.appendChild(g);
  }
}
