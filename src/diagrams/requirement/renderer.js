/**
 * Renders a RequirementAST into SVG: requirement/element boxes joined by relations.
 * @module diagrams/requirement/renderer
 */

import { svgEl } from '../../core/renderer.js';
import { layoutFlowchart } from '../../core/layout.js';

const BOX_W = 160, BOX_H = 90, H_GAP = 60, V_GAP = 50, PAD = 40, COLS = 3; // Box size, gaps, padding, columns.

// Fill colour per requirement kind (lower-cased); falls back to default.
const KIND_COLORS = {
  default:               'oklch(0.38 0.10 220)',
  performancerequirement:'oklch(0.38 0.10 155)',
  interfacerequirement:  'oklch(0.38 0.10 45)',
  physicalrequirement:   'oklch(0.38 0.10 330)',
  designconstraint:      'oklch(0.38 0.10 270)',
};

/**
 * Resolves the box fill colour for a requirement kind.
 * @param {string} [kind] - Requirement kind (case-insensitive).
 * @returns {string} OKLCH colour string.
 */
function kindColor(kind) { return KIND_COLORS[kind?.toLowerCase()] ?? KIND_COLORS.default; }

/**
 * Draws all relationships into the edge layer, replacing its prior contents.
 * Relationships connect node centres (both requirements and elements share one
 * lookup list); redrawing on drag keeps the lines attached to moved boxes.
 * @param {ReturnType<import('./parser.js').parseRequirement>} ast - AST whose nodes already have x/y set.
 * @param {SVGGElement} edgeLayer - SVG group receiving relationship lines.
 * @returns {void}
 */
function drawRels(ast, edgeLayer) {
  edgeLayer.replaceChildren();
  const defs = svgEl('defs');
  const m = svgEl('marker', { id: 'req-arr', markerWidth: '10', markerHeight: '7', refX: '9', refY: '3.5', orient: 'auto' });
  m.appendChild(svgEl('polygon', { points: '0 0,10 3.5,0 7', fill: 'var(--gm-edge)' }));
  defs.appendChild(m);
  edgeLayer.appendChild(defs);

  // Requirements and elements share one id space for relationship endpoints.
  const all = [...ast.requirements, ...ast.elements];
  for (const rel of ast.rels) {
    const bf = all.find(n => n.id === rel.from);
    const bt = all.find(n => n.id === rel.to);
    if (!bf || !bt) continue;
    const fx = bf.x + BOX_W / 2, fy = bf.y + BOX_H / 2;
    const tx = bt.x + BOX_W / 2, ty = bt.y + BOX_H / 2;
    edgeLayer.appendChild(svgEl('line', {
      class: 'gm-req-rel', x1: fx, y1: fy, x2: tx, y2: ty,
      stroke: 'var(--gm-edge)', 'stroke-width': '1.5',
      'marker-end': 'url(#req-arr)',
    }));
    if (rel.rel) {
      edgeLayer.appendChild(svgEl('text', {
        class: 'gm-req-rel-label',
        x: (fx + tx) / 2, y: (fy + ty) / 2 - 7,
        'text-anchor': 'middle',
      }, rel.rel));
    }
  }
}

/**
 * Renders a RequirementAST into the node and edge layers. Clears both first.
 *
 * Requirements and elements are placed together into one grid wrapping every
 * {@link COLS} columns. Each box shows a kind banner, id, an info line
 * (text/type, truncated), and an optional colour-coded risk chip. When
 * `interact` is provided, boxes are draggable and relations redraw live.
 *
 * @param {ReturnType<import('./parser.js').parseRequirement>} ast - Parsed AST (mutated with x/y).
 * @param {SVGGElement} nodeLayer - SVG group receiving the boxes.
 * @param {SVGGElement} edgeLayer - SVG group receiving relationship lines.
 * @param {{ attachDrag: (g: SVGGElement, model: object, onMove: () => void) => void }} [interact] - Optional drag controller.
 * @returns {void}
 */
export function renderRequirement(ast, nodeLayer, edgeLayer, interact) {
  nodeLayer.replaceChildren(); edgeLayer.replaceChildren();
  const { requirements, elements } = ast;
  const all = [...requirements, ...elements];
  if (!all.length) return;

  // Relationship-aware layered layout (honors `direction`), falling back to a
  // grid only when there are no relationships to drive the flow.
  all.forEach(item => { item.w = BOX_W; item.h = BOX_H; });
  if (ast.rels?.length) {
    layoutFlowchart(all, ast.rels, ast.direction || 'TB');
  } else {
    all.forEach((item, i) => {
      item.x = PAD + (i % COLS) * (BOX_W + H_GAP);
      item.y = PAD + Math.floor(i / COLS) * (BOX_H + V_GAP);
    });
  }
  drawRels(ast, edgeLayer);

  for (const item of all) {
    // Requirements carry a `kind`; elements do not, so they get a neutral fill.
    // An explicit `style`/`classDef` fill overrides the kind colour.
    const isReq = 'kind' in item;
    const color = item.style?.fill ?? (isReq ? kindColor(item.kind) : 'oklch(0.32 0.04 0)');
    const g = svgEl('g', { class: 'gm-node', 'data-id': item.id, transform: `translate(${item.x},${item.y})` });

    g.appendChild(svgEl('rect', { x: 0, y: 0, width: BOX_W, height: BOX_H, fill: color, rx: 6 }));
    // Darkened header banner; the second rect squares off the banner's lower corners.
    g.appendChild(svgEl('rect', { x: 0, y: 0, width: BOX_W, height: 22, fill: 'rgba(0,0,0,.25)', rx: 6 }));
    g.appendChild(svgEl('rect', { x: 0, y: 16, width: BOX_W, height: 6,  fill: 'rgba(0,0,0,.25)' }));

    g.appendChild(svgEl('text', { class: 'gm-req-kind',  x: BOX_W/2, y: 11, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: 'rgba(255,255,255,.65)', 'font-size': '9', 'font-style': 'italic', 'pointer-events': 'none' }, isReq ? (item.kind ?? 'requirement') : 'element'));
    g.appendChild(svgEl('text', { class: 'gm-req-name',  x: BOX_W/2, y: 36, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#fff', 'font-weight': '700', 'font-size': '12', 'pointer-events': 'none' }, item.id));
    const info = (item.text ?? item.type ?? '').slice(0, 30);
    if (info) g.appendChild(svgEl('text', { class: 'gm-req-text', x: BOX_W/2, y: 54, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: 'rgba(255,255,255,.7)', 'font-size': '10', 'pointer-events': 'none' }, info.length > 24 ? info.slice(0,23)+'…' : info));
    if (item.risk) {
      // Risk chip colour: red (high) / amber (medium) / green (low/other). Case-insensitive.
      const risk = String(item.risk).toLowerCase();
      const rc = risk === 'high' ? 'oklch(0.6 0.18 30)' : risk === 'medium' ? 'oklch(0.65 0.14 60)' : 'oklch(0.6 0.1 155)';
      g.appendChild(svgEl('rect', { x: 4, y: BOX_H - 18, width: 44, height: 14, fill: rc, rx: 3 }));
      g.appendChild(svgEl('text', { x: 26, y: BOX_H - 11, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#fff', 'font-size': '8', 'pointer-events': 'none' }, item.risk));
    }
    // Verify-method chip (bottom-right) for requirements.
    if (item.verifyMethod) {
      g.appendChild(svgEl('rect', { x: BOX_W - 52, y: BOX_H - 18, width: 48, height: 14, fill: 'rgba(0,0,0,.3)', rx: 3 }));
      g.appendChild(svgEl('text', { x: BOX_W - 28, y: BOX_H - 11, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: 'rgba(255,255,255,.8)', 'font-size': '8', 'pointer-events': 'none' }, item.verifyMethod));
    }
    if (interact) interact.attachDrag(g, item, () => drawRels(ast, edgeLayer));
    nodeLayer.appendChild(g);
  }
}
