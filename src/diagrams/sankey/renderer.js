/**
 * @file Renders a SankeyAST into SVG.
 *
 * Nodes are laid out in up to three vertical columns (sources, intermediate,
 * pure targets); each node's height is proportional to its larger of in/out
 * flow. Links are drawn as variable-width bezier ribbons whose endpoint
 * thickness encodes the flow value.
 */
import { svgEl } from '../../core/renderer.js';

// Layout constants (SVG user units). NODE_W is the rectangle width; PAD_* are
// the inner margins; HUES cycles OKLCH hues across node colors.
const NODE_W = 16, CHART_W = 500, CHART_H = 400, PAD_X = 40, PAD_Y = 20;
const HUES = [160, 220, 45, 330, 90, 270, 20, 185];

/**
 * Render a SankeyAST into the given SVG layers.
 *
 * @param {{ nodes: Array<{id:string, side:string}>, links: Array<{source:string, target:string, value:number}> }} ast - Parsed sankey AST.
 * @param {SVGElement} nodeLayer - Layer that receives node rects, labels and link ribbons.
 * @param {SVGElement} edgeLayer - Layer cleared but unused (links live in nodeLayer).
 * @returns {void}
 */
export function renderSankey(ast, nodeLayer, edgeLayer) {
  nodeLayer.replaceChildren(); edgeLayer.replaceChildren();
  const { nodes, links } = ast;
  if (!nodes.length) return;

  const totalValue = links.reduce((s, l) => s + l.value, 0) || 1;
  const usableH = CHART_H - PAD_Y * 2; // vertical space available for stacked nodes

  // Separate left (source) and right (target/mixed) nodes
  const leftNodes  = nodes.filter(n => n.side === 'left');
  const rightNodes = nodes.filter(n => n.side === 'right');
  // Nodes that appear on both sides stay left
  const allRight   = [...new Set(links.map(l => l.target))];
  const allLeft    = [...new Set(links.map(l => l.source))];
  const pureRight  = allRight.filter(id => !allLeft.includes(id));
  const midNodes   = allRight.filter(id => allLeft.includes(id));

  // Position nodes
  const nodePos = new Map(); // id → {x, y, h, color}

  /**
   * Stack a column of nodes vertically at a fixed x, sizing each node's height
   * proportionally to its dominant flow (max of inflow/outflow) within the group.
   *
   * @param {string[]} ids - Node ids to place in this column.
   * @param {number} xPos - Left x coordinate shared by the column.
   * @returns {void} Mutates `nodePos` with the computed {x, y, h, color}.
   */
  function positionGroup(ids, xPos) {
    // Group total = sum of each node's dominant flow; drives proportional heights.
    const groupTotal = ids.reduce((s, id) => {
      const outflow = links.filter(l => l.source === id).reduce((a, l) => a + l.value, 0);
      const inflow  = links.filter(l => l.target === id).reduce((a, l) => a + l.value, 0);
      return s + Math.max(outflow, inflow);
    }, 0) || 1;
    let y = PAD_Y;
    ids.forEach((id, i) => {
      const outflow = links.filter(l => l.source === id).reduce((a, l) => a + l.value, 0);
      const inflow  = links.filter(l => l.target === id).reduce((a, l) => a + l.value, 0);
      const nodeH   = Math.max(10, (Math.max(outflow, inflow) / groupTotal) * usableH);
      nodePos.set(id, { x: xPos, y, h: nodeH, color: `oklch(0.6 0.17 ${HUES[i % HUES.length]})` });
      y += nodeH + 8;
    });
  }

  // Three columns: pure sources at left, intermediates centered, pure targets at right.
  const sourceIds = allLeft.filter(id => !pureRight.includes(id));
  positionGroup(sourceIds, PAD_X);
  if (midNodes.length) positionGroup(midNodes, PAD_X + CHART_W / 2);
  positionGroup(pureRight, PAD_X + CHART_W);

  const g = svgEl('g');

  // Links (bezier with variable width). Each ribbon's thickness at an endpoint
  // is value/totalFlow of that node times the node height; ribbons stack along
  // each node edge using a running offset so they don't overlap.
  const linkOffsets = new Map(); // srcId → current out offset; tgtId → current in offset
  for (const link of links) {
    const src = nodePos.get(link.source), tgt = nodePos.get(link.target);
    if (!src || !tgt) continue;

    const srcTotal  = links.filter(l => l.source === link.source).reduce((a,l) => a+l.value, 0) || 1;
    const tgtTotal  = links.filter(l => l.target === link.target ).reduce((a,l) => a+l.value, 0) || 1;
    // Ribbon height at each end, proportional to this link's share of the node flow.
    const lhSrc = (link.value / srcTotal) * src.h;
    const lhTgt = (link.value / tgtTotal) * tgt.h;

    // Running stack offsets keyed by direction ('o:' out of source, 'i:' into target).
    const srcOffKey = 'o:' + link.source; if (!linkOffsets.has(srcOffKey)) linkOffsets.set(srcOffKey, 0);
    const tgtOffKey = 'i:' + link.target; if (!linkOffsets.has(tgtOffKey)) linkOffsets.set(tgtOffKey, 0);
    const sy = src.y + linkOffsets.get(srcOffKey);
    const ty = tgt.y + linkOffsets.get(tgtOffKey);
    linkOffsets.set(srcOffKey, linkOffsets.get(srcOffKey) + lhSrc);
    linkOffsets.set(tgtOffKey, linkOffsets.get(tgtOffKey) + lhTgt);

    // Cubic bezier with control points at the horizontal midpoint for an S-curve;
    // the path closes back along the opposite edge to form a filled ribbon.
    const x1 = src.x + NODE_W, x2 = tgt.x, mx = (x1 + x2) / 2;
    const path = `M${x1},${sy} C${mx},${sy} ${mx},${ty} ${x2},${ty} L${x2},${ty+lhTgt} C${mx},${ty+lhTgt} ${mx},${sy+lhSrc} ${x1},${sy+lhSrc} Z`;
    g.appendChild(svgEl('path', {
      class: 'gm-sankey-flow',
      d: path,
      fill: src.color,
      opacity: '0.45',
    }));
  }

  // Nodes (rectangles). Labels sit outside the node: to the left for the
  // rightmost column, to the right otherwise.
  for (const [id, p] of nodePos) {
    g.appendChild(svgEl('rect', {
      class: 'gm-sankey-node',
      x: p.x, y: p.y, width: NODE_W, height: p.h,
      fill: p.color, rx: 3,
    }));
    const isRight = p.x > PAD_X + CHART_W / 2;
    g.appendChild(svgEl('text', {
      class: 'gm-sankey-label',
      x: isRight ? p.x - 6 : p.x + NODE_W + 6,
      y: p.y + p.h / 2,
      'text-anchor': isRight ? 'end' : 'start',
      'dominant-baseline': 'middle',
    }, id));
  }

  nodeLayer.appendChild(g);
}
