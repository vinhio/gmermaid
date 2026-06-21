/**
 * Renders a MindmapAST into SVG using a horizontal tree layout.
 * @module diagrams/mindmap/renderer
 */
import { svgEl } from '../../core/renderer.js';

const H_GAP = 140; // horizontal distance between tree depths (x = depth * H_GAP)
const V_GAP = 48;  // vertical distance allotted to each leaf slot

/**
 * Compute each node's `slots`: the number of leaf rows its subtree occupies.
 * A leaf is 1 slot; an internal node is the sum of its children's slots. This
 * vertical "weight" drives the non-overlapping layout in {@link assignPos}.
 * @param {{children: Array, slots?: number}} node - Subtree root (mutated with `slots`).
 * @returns {number} The node's slot count.
 */
function calcSlots(node) {
  if (!node.children.length) return (node.slots = 1);
  node.slots = node.children.reduce((s, c) => s + calcSlots(c), 0);
  return node.slots;
}

/**
 * Assign `x`/`y`/`depth` to a subtree. x is fixed by depth; children are stacked
 * vertically around `centerY`, each occupying a band proportional to its slots,
 * and centered within that band.
 * @param {{children: Array, slots: number, x?: number, y?: number, depth?: number}} node - Subtree root (mutated).
 * @param {number} depth - Tree depth (0 = root), maps to x.
 * @param {number} centerY - Vertical center this node is placed at.
 * @returns {void}
 */
function assignPos(node, depth, centerY) {
  node.x     = depth * H_GAP;
  node.y     = centerY;
  node.depth = depth;
  if (!node.children.length) return;
  // Start at the top of this node's vertical band, then walk children downward.
  let cy = centerY - ((node.slots - 1) * V_GAP) / 2;
  for (const child of node.children) {
    // Center the child within its own slot band.
    const childCy = cy + ((child.slots - 1) * V_GAP) / 2;
    assignPos(child, depth + 1, childCy);
    cy += child.slots * V_GAP;
  }
}

/**
 * Depth-first generator yielding every node in the subtree (root first).
 * @param {{children: Array}} node - Subtree root.
 * @yields {object} Each node in the subtree.
 */
function* allNodes(node) {
  yield node;
  for (const c of node.children) yield* allNodes(c);
}

/** Hue values (oklch) cycled by node depth. */
const HUES = [160, 220, 45, 330, 90, 270, 20, 185];

/**
 * Color for a node by its depth (root uses the accent color).
 * @param {number} depth - Tree depth.
 * @returns {string} A CSS color string.
 */
function nodeColor(depth) {
  return depth === 0 ? 'var(--gm-accent)' : `oklch(0.48 0.12 ${HUES[depth % HUES.length]})`;
}

/**
 * Build the SVG shape element for a node, centered at local (0,0).
 * @param {{shape: string}} node - The node (its `shape` selects the geometry).
 * @param {string} color - Fill color.
 * @returns {SVGElement} A circle, polygon, or rect element.
 */
function buildShape(node, color) {
  switch (node.shape) {
    case 'circle':
      return svgEl('circle', { class: 'gm-mm-shape', cx: 0, cy: 0, r: 28, fill: color, stroke: 'var(--gm-bg)', 'stroke-width': 2 });
    case 'hexagon': {
      // Six vertices evenly spaced (60° apart), offset by -30° for a flat-top hexagon.
      const r = 28, pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        pts.push(`${r * Math.cos(a)},${r * Math.sin(a)}`);
      }
      return svgEl('polygon', { class: 'gm-mm-shape', points: pts.join(' '), fill: color, stroke: 'var(--gm-bg)', 'stroke-width': 2 });
    }
    case 'bang':
      return svgEl('rect', { class: 'gm-mm-shape', x: -34, y: -16, width: 68, height: 32, fill: color, rx: 2, stroke: 'var(--gm-bg)', 'stroke-width': 2 });
    case 'rect':
      return svgEl('rect', { class: 'gm-mm-shape', x: -34, y: -16, width: 68, height: 32, fill: color, rx: 0, stroke: 'var(--gm-bg)', 'stroke-width': 2 });
    default: // 'rounded' or 'cloud'
      return svgEl('rect', { class: 'gm-mm-shape', x: -34, y: -16, width: 68, height: 32, fill: color, rx: 10, stroke: 'var(--gm-bg)', 'stroke-width': 2 });
  }
}

/**
 * Build a group of parent→child connector edges for the whole tree.
 * Each edge is a horizontal S-curve (cubic bezier) between node centers.
 * @param {object} root - The laid-out tree root (nodes must have x/y/depth set).
 * @returns {SVGGElement} A `<g>` containing one path per edge.
 */
function buildEdges(root) {
  const g = svgEl('g');
  for (const node of allNodes(root)) {
    for (const child of node.children) {
      // Control points at the horizontal midpoint give a smooth left-to-right curve.
      const mx = (node.x + child.x) / 2;
      g.appendChild(svgEl('path', {
        class: 'gm-mm-edge',
        d: `M${node.x},${node.y} C${mx},${node.y} ${mx},${child.y} ${child.x},${child.y}`,
        fill: 'none',
        stroke: `oklch(0.48 0.12 ${HUES[(child.depth ?? 1) % HUES.length]})`,
        'stroke-width': '1.5',
        opacity: '0.7',
      }));
    }
  }
  return g;
}

/**
 * Render a MindmapAST: lay out the tree, draw connector edges, then draw each
 * node (shape + label) as a draggable group. Clears both layers first.
 * @param {{root: (object|null)}} ast - MindmapAST from {@link parseMindmap}.
 * @param {SVGElement} nodeLayer - Layer for node groups.
 * @param {SVGElement} edgeLayer - Layer for connector edges.
 * @param {{attachDrag: Function}} [interact] - Optional interaction helper; when
 *   present, nodes become draggable and edges are redrawn live during a drag.
 * @returns {void}
 */
export function renderMindmap(ast, nodeLayer, edgeLayer, interact) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();

  const { root } = ast;
  if (!root) return;

  // Two-pass layout: size each subtree (slots), then assign x/y from those sizes.
  calcSlots(root);
  assignPos(root, 0, 0);

  edgeLayer.appendChild(buildEdges(root));

  for (const node of allNodes(root)) {
    const color = nodeColor(node.depth ?? 0);

    const nodeG = svgEl('g', {
      class: 'gm-mm-node',
      'data-id': node.id,
      transform: `translate(${node.x},${node.y})`,
    });
    nodeG.appendChild(buildShape(node, color));

    const label = node.label.length > 12 ? node.label.slice(0, 11) + '…' : node.label;
    nodeG.appendChild(svgEl('text', {
      class: 'gm-mm-label',
      x: 0, y: 0,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: 'var(--gm-bg)',
      'font-size': (node.depth ?? 0) === 0 ? '13' : '11',
      'font-weight': (node.depth ?? 0) === 0 ? '700' : '400',
      'pointer-events': 'none',
    }, label));

    if (interact) {
      interact.attachDrag(nodeG, node, () => {
        // Redraw edges live as the node moves
        edgeLayer.replaceChildren();
        edgeLayer.appendChild(buildEdges(root));
      });
    }

    nodeLayer.appendChild(nodeG);
  }
}
