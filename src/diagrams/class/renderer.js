/**
 * Class-diagram renderer: draws a ClassAST into SVG. Each class becomes a
 * three-compartment box (header / attributes / methods) appended to nodeLayer;
 * relationships become edges with UML markers appended to edgeLayer.
 */

import { svgEl } from '../../core/renderer.js';
import { connectBoxes } from '../../core/edges.js';

const CLASS_W    = 200; // class box width (px)
const HEADER_H   = 44;  // header compartment height (px)
const SECTION_H  = 26;  // per-member row height (px)
const MIN_BODY_H = 20;  // minimum height of an empty attr/method compartment (px)

/**
 * Render a class diagram AST into the given SVG layers.
 * @param {object} ast - ClassAST from parseClass ({ classes, relationships, notes }).
 * @param {SVGElement} nodeLayer - Group element that receives class boxes (and markers).
 * @param {SVGElement} edgeLayer - Group element that receives relationship edges.
 * @param {{ attachDrag: Function }} interact - Interaction helper for dragging.
 * @param {boolean} [curved=false] - Whether edges use Bézier curves (default orthogonal).
 * @returns {void}
 */
export function renderClass(ast, nodeLayer, edgeLayer, interact, curved = false) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();

  ensureMarkers(nodeLayer);

  // Compute each box's height = header + attribute compartment + separator
  // (1px) + method compartment, with empty compartments clamped to MIN_BODY_H.
  for (const cls of ast.classes) {
    const attrs    = cls.attributes.filter(a => !a.isMethod);
    const methods  = cls.attributes.filter(a => a.isMethod);
    const attrH    = attrs.length   ? attrs.length   * SECTION_H + 8 : MIN_BODY_H;
    const methodH  = methods.length ? methods.length * SECTION_H + 8 : MIN_BODY_H;
    cls.w = CLASS_W;
    cls.h = HEADER_H + attrH + 1 + methodH;
  }

  for (const cls of ast.classes) {
    const g = buildClassBox(cls);
    nodeLayer.appendChild(g);
    interact.attachDrag(g, cls, () => redrawEdges(ast, edgeLayer, curved));
  }

  redrawEdges(ast, edgeLayer, curved);
}

/**
 * Build a class box `<g>`: background, header (optional stereotype + name),
 * and the attribute and method compartments separated by lines.
 * @param {object} cls - Class AST entry (with computed `w`/`h`).
 * @returns {SVGGElement} The positioned class group.
 */
function buildClassBox(cls) {
  const { id, name, stereotype, attributes, w, h } = cls;
  const attrs   = attributes.filter(a => !a.isMethod);
  const methods = attributes.filter(a => a.isMethod);
  const attrH   = attrs.length   ? attrs.length   * SECTION_H + 8 : MIN_BODY_H;

  const g = svgEl('g', { class: 'gm-class-node', 'data-id': id, transform: `translate(${cls.x},${cls.y})` });

  // Background
  g.appendChild(svgEl('rect', { class: 'gm-class-bg', x: 0, y: 0, width: w, height: h, rx: 8 }));

  // Header background
  g.appendChild(svgEl('rect', { class: 'gm-class-header', x: 1, y: 1, width: w - 2, height: HEADER_H - 1, rx: 7 }));

  // Stereotype line sits above the name; if present, nudge the name down.
  let nameY = HEADER_H / 2 + 6;
  if (stereotype) {
    nameY = HEADER_H / 2 + 10;
    g.appendChild(svgEl('text', {
      class: 'gm-class-stereo',
      x: w / 2, y: HEADER_H / 2 - 6,
      'text-anchor': 'middle',
    }, `«${stereotype}»`));
  }

  // Class name
  g.appendChild(svgEl('text', {
    class: 'gm-class-name',
    x: w / 2, y: nameY,
    'text-anchor': 'middle',
  }, name));

  // Separator line 1 (header / attrs)
  g.appendChild(svgEl('line', { class: 'gm-class-sep', x1: 0, y1: HEADER_H, x2: w, y2: HEADER_H }));

  // Attributes — one text row each, vertically centered within its SECTION_H slot.
  attrs.forEach((a, i) => {
    const y = HEADER_H + 6 + i * SECTION_H + SECTION_H / 2 + 4;
    g.appendChild(svgEl('text', { class: 'gm-class-attr', x: 10, y }, formatMember(a)));
  });

  // Separator line 2 (attrs / methods)
  const sepY = HEADER_H + attrH;
  g.appendChild(svgEl('line', { class: 'gm-class-sep', x1: 0, y1: sepY, x2: w, y2: sepY }));

  // Methods
  methods.forEach((m, i) => {
    const y = sepY + 6 + i * SECTION_H + SECTION_H / 2 + 4;
    g.appendChild(svgEl('text', { class: 'gm-class-method', x: 10, y }, formatMember(m)));
  });

  return g;
}

/**
 * Format a member into its UML text line (e.g. `+save(id): bool`).
 * @param {object} m - Member entry ({ visibility, name, type, isMethod, isAbstract, params }).
 * @returns {string} The formatted member string.
 */
function formatMember(m) {
  const vis = { public: '+', private: '-', protected: '#', package: '~', static: '$' }[m.visibility] ?? '';
  if (m.isMethod) {
    const ret = m.type && m.type !== 'void' ? `: ${m.type}` : '';
    const abs = m.isAbstract ? '*' : '';
    return `${vis}${m.name}(${m.params ?? ''})${abs}${ret}`;
  }
  return m.type ? `${vis}${m.name}: ${m.type}` : `${vis}${m.name}`;
}

/**
 * Clear and redraw all relationship edges with their UML markers and labels.
 * Called on initial render and after each class drag.
 * @param {object} ast - ClassAST with up-to-date class positions.
 * @param {SVGElement} edgeLayer - Group element to repopulate.
 * @param {boolean} curved - Whether to draw Bézier curves vs. orthogonal lines.
 * @returns {void}
 */
function redrawEdges(ast, edgeLayer, curved) {
  edgeLayer.replaceChildren();
  const classMap = new Map(ast.classes.map(c => [c.id, c]));

  for (const rel of ast.relationships) {
    const a = classMap.get(rel.from);
    const b = classMap.get(rel.to);
    if (!a || !b) continue;

    // Four-sided routing: anchor each end to the box side facing the other class.
    const A = { x: a.x, y: a.y, w: a.w ?? CLASS_W, h: a.h ?? HEADER_H };
    const B = { x: b.x, y: b.y, w: b.w ?? CLASS_W, h: b.h ?? HEADER_H };
    const { d, p1, p2, mx, my } = connectBoxes(A, B, curved);

    const g = svgEl('g', { class: 'gm-class-edge', 'data-from': rel.from, 'data-to': rel.to });

    const { stroke, dasharray, markerStart, markerEnd } = relStyle(rel.type);
    const pathAttrs = { class: 'gm-class-edge-path', d, fill: 'none', stroke, 'stroke-width': '1.5' };
    if (dasharray) pathAttrs['stroke-dasharray'] = dasharray;
    if (markerStart) pathAttrs['marker-start'] = markerStart;
    if (markerEnd)   pathAttrs['marker-end']   = markerEnd;
    g.appendChild(svgEl('path', pathAttrs));

    // Multiplicity labels — nudged outward along each anchor's side normal,
    // with horizontal alignment chosen from the normal's x component.
    const multAnchor = nx => nx > 0 ? 'start' : nx < 0 ? 'end' : 'middle';
    if (rel.fromLabel) {
      g.appendChild(svgEl('text', { class: 'gm-class-mult', x: p1.x + p1.nx * 14, y: p1.y + p1.ny * 14 - 6, 'text-anchor': multAnchor(p1.nx) }, rel.fromLabel));
    }
    if (rel.toLabel) {
      g.appendChild(svgEl('text', { class: 'gm-class-mult', x: p2.x + p2.nx * 14, y: p2.y + p2.ny * 14 - 6, 'text-anchor': multAnchor(p2.nx) }, rel.toLabel));
    }
    if (rel.label) {
      g.appendChild(svgEl('text', { class: 'gm-edge-label', x: mx, y: my - 6, 'text-anchor': 'middle' }, rel.label));
    }

    edgeLayer.appendChild(g);
  }
}

/**
 * Map a relationship type to its stroke style and marker references.
 * @param {string} type - Relationship type from the parser (inheritance, composition, etc.).
 * @returns {{ stroke: string, dasharray?: string, markerStart?: string, markerEnd?: string }} Path style descriptor.
 */
function relStyle(type) {
  switch (type) {
    case 'inheritance':  return { stroke: 'var(--gm-edge)', markerEnd: 'url(#gm-cls-inherit)' };
    case 'realization':  return { stroke: 'var(--gm-edge)', dasharray: '6,4', markerEnd: 'url(#gm-cls-inherit)' };
    case 'composition':  return { stroke: 'var(--gm-edge)', markerStart: 'url(#gm-cls-compose)' };
    case 'aggregation':  return { stroke: 'var(--gm-edge)', markerStart: 'url(#gm-cls-aggregate)' };
    case 'association':  return { stroke: 'var(--gm-edge)', markerEnd: 'url(#gm-cls-arrow)' };
    case 'dependency':   return { stroke: 'var(--gm-edge)', dasharray: '6,4', markerEnd: 'url(#gm-cls-arrow)' };
    default:             return { stroke: 'var(--gm-edge)' };
  }
}

/**
 * Inject the shared UML arrowhead/diamond markers into the SVG's defs once.
 * No-op if they already exist or no parent SVG is found.
 * @param {SVGElement} nodeLayer - A layer whose owning SVG receives the markers.
 * @returns {void}
 */
function ensureMarkers(nodeLayer) {
  const svg = nodeLayer.closest('svg') ?? nodeLayer.ownerSVGElement;
  if (!svg || svg.querySelector('#gm-cls-inherit')) return;

  let defs = svg.querySelector('defs');
  if (!defs) { defs = svgEl('defs'); svg.insertBefore(defs, svg.firstChild); }

  // Hollow triangle (inheritance / realization) — points right
  const inherit = svgEl('marker', { id: 'gm-cls-inherit', markerWidth: 14, markerHeight: 10, refX: 14, refY: 5, orient: 'auto' });
  inherit.appendChild(svgEl('path', { d: 'M0,0 L14,5 L0,10 Z', fill: 'var(--gm-panel)', stroke: 'var(--gm-edge)', 'stroke-width': '1.5' }));
  defs.appendChild(inherit);

  // Filled triangle (association / dependency)
  const arrow = svgEl('marker', { id: 'gm-cls-arrow', markerWidth: 10, markerHeight: 7, refX: 10, refY: 3.5, orient: 'auto' });
  arrow.appendChild(svgEl('path', { d: 'M0,0 L10,3.5 L0,7 Z', fill: 'var(--gm-edge)' }));
  defs.appendChild(arrow);

  // Filled diamond (composition) — points toward source
  const compose = svgEl('marker', { id: 'gm-cls-compose', markerWidth: 16, markerHeight: 10, refX: 0, refY: 5, orient: 'auto-start-reverse' });
  compose.appendChild(svgEl('path', { d: 'M0,5 L8,0 L16,5 L8,10 Z', fill: 'var(--gm-edge)' }));
  defs.appendChild(compose);

  // Hollow diamond (aggregation)
  const aggregate = svgEl('marker', { id: 'gm-cls-aggregate', markerWidth: 16, markerHeight: 10, refX: 0, refY: 5, orient: 'auto-start-reverse' });
  aggregate.appendChild(svgEl('path', { d: 'M0,5 L8,0 L16,5 L8,10 Z', fill: 'var(--gm-panel)', stroke: 'var(--gm-edge)', 'stroke-width': '1.5' }));
  defs.appendChild(aggregate);
}
