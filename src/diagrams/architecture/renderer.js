/**
 * @file Renders an ArchitectureAST into SVG.
 *
 * Services and junctions are grouped into (possibly nested) group containers via
 * a recursive cluster layout, then connected by port-anchored bezier edges with
 * optional directional arrowheads.
 */
import { svgEl } from '../../core/renderer.js';
import { anchorPoint, edgePath } from '../../core/edges.js';

const SVC_W = 120, SVC_H = 64, JUNC = 18;       // service box, junction dot
const GAP = 36, GPAD = 18, GLABEL = 22, PAD = 40; // gaps, group padding/label, outer pad
const ICON_HUES = { database: 45, server: 220, internet: 155, cloud: 90, queue: 330, storage: 270, disk: 270 };

/**
 * Resolve a fill color for a service from its icon keyword.
 * @param {string} icon - Icon keyword (may be a `pack:name` custom icon).
 * @returns {string} OKLCH color string.
 */
function svcColor(icon) {
  return `oklch(0.42 0.10 ${ICON_HUES[icon?.toLowerCase()] ?? 220})`;
}

/**
 * Render an ArchitectureAST into the given SVG layers.
 * @param {{ services: Array<object>, groups: Array<object>, connections: Array<object> }} ast - Parsed AST (mutated with positions).
 * @param {SVGElement} nodeLayer - Layer that receives group frames and nodes.
 * @param {SVGElement} edgeLayer - Layer that receives connection edges.
 * @param {{ attachDrag: Function }} [interact] - Optional drag helper.
 * @returns {void}
 */
export function renderArchitecture(ast, nodeLayer, edgeLayer, interact) {
  nodeLayer.replaceChildren(); edgeLayer.replaceChildren();
  const { services, groups, connections } = ast;
  if (!services.length && !groups.length) return;

  const itemsByGroup = groupBy(services, s => s.group);
  const groupsByParent = groupBy(groups, g => g.parent);

  // Phase 1 — recursive sizing (services/junctions + nested groups per container).
  function layoutContainer(gid) {
    const svcs = itemsByGroup.get(gid) ?? [];
    const subs = groupsByParent.get(gid) ?? [];
    for (const sg of subs) { const sz = layoutContainer(sg.id); sg.gw = sz.w; sg.gh = sz.h; }
    const items = [
      ...svcs.map(s => ({ ref: s, w: s.kind === 'junction' ? JUNC : SVC_W, h: s.kind === 'junction' ? JUNC : SVC_H })),
      ...subs.map(g => ({ ref: g, w: g.gw, h: g.gh })),
    ];
    const left = gid == null ? PAD : GPAD;
    const top  = gid == null ? PAD : GLABEL + GPAD;
    const area = items.reduce((a, it) => a + it.w * it.h, 0);
    const rowMax = Math.max(SVC_W * 2 + GAP, Math.sqrt(area) * 1.5);
    let x = left, y = top, rowH = 0, maxR = left, maxB = top;
    for (const it of items) {
      if (x > left && x + it.w > left + rowMax) { x = left; y += rowH + GAP; rowH = 0; }
      it.ref._lx = x; it.ref._ly = y;
      maxR = Math.max(maxR, x + it.w); maxB = Math.max(maxB, y + it.h);
      x += it.w + GAP; rowH = Math.max(rowH, it.h);
    }
    const padR = gid == null ? PAD : GPAD;
    return { w: maxR + padR, h: maxB + padR };
  }
  layoutContainer(null);

  // Phase 2 — absolute positions.
  (function place(gid, ox, oy) {
    for (const s of (itemsByGroup.get(gid) ?? [])) {
      s.w = s.kind === 'junction' ? JUNC : SVC_W; s.h = s.kind === 'junction' ? JUNC : SVC_H;
      s.x = ox + s._lx; s.y = oy + s._ly;
    }
    for (const g of (groupsByParent.get(gid) ?? [])) { g.gx = ox + g._lx; g.gy = oy + g._ly; place(g.id, g.gx, g.gy); }
  })(null, 0, 0);

  ensureMarkers(nodeLayer);
  const svcById = new Map(services.map(s => [s.id, s]));
  const grpById = new Map(groups.map(g => [g.id, g]));

  // Group frames (outermost first so nested ones paint on top).
  for (const g of [...groups].sort((a, b) => groupDepth(a, grpById) - groupDepth(b, grpById))) {
    nodeLayer.appendChild(svgEl('rect', {
      class: 'gm-arch-group', x: g.gx, y: g.gy, width: g.gw, height: g.gh, rx: 8,
      fill: 'rgba(88,166,255,.05)', stroke: 'var(--gm-panel-border)', 'stroke-dasharray': '6,3',
    }));
    nodeLayer.appendChild(svgEl('text', { class: 'gm-arch-group-label', x: g.gx + 10, y: g.gy + 15, fill: 'var(--gm-muted)', 'font-size': 11, 'font-weight': 700, 'pointer-events': 'none' }, g.label || g.id));
  }

  const redraw = () => drawConnections(connections, edgeLayer, svcById, grpById);
  redraw();

  for (const s of services) {
    const g = svgEl('g', { class: 'gm-node', 'data-id': s.id, transform: `translate(${s.x},${s.y})` });
    if (s.kind === 'junction') {
      g.appendChild(svgEl('circle', { cx: JUNC / 2, cy: JUNC / 2, r: JUNC / 2, fill: 'var(--gm-muted)', stroke: 'var(--gm-bg)', 'stroke-width': 2 }));
    } else {
      g.appendChild(svgEl('rect', { x: 0, y: 0, width: SVC_W, height: SVC_H, fill: svcColor(s.icon), rx: 8 }));
      g.appendChild(svgEl('text', { x: SVC_W / 2, y: 22, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: 'rgba(255,255,255,.5)', 'font-size': 16, 'font-family': 'var(--gm-label-font)', 'pointer-events': 'none' }, (s.icon || '?').slice(0, 2).toUpperCase()));
      g.appendChild(svgEl('text', { class: 'gm-node-text', x: SVC_W / 2, y: 46, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#fff', 'font-size': 11, 'pointer-events': 'none' }, s.label.length > 14 ? s.label.slice(0, 13) + '…' : s.label));
    }
    if (interact) interact.attachDrag(g, s, redraw);
    nodeLayer.appendChild(g);
  }
}

/**
 * Draw all connection edges, anchoring to the service (or its group when the
 * `{group}` modifier is set) at the declared port, with directional arrowheads.
 * @param {Array<object>} connections - Edge list.
 * @param {SVGGElement} edgeLayer - Layer to repopulate.
 * @param {Map<string, object>} svcById - Service id -> service.
 * @param {Map<string, object>} grpById - Group id -> group.
 * @returns {void}
 */
function drawConnections(connections, edgeLayer, svcById, grpById) {
  edgeLayer.replaceChildren();
  const box = (id, useGroup) => {
    const s = svcById.get(id);
    if (useGroup && s?.group && grpById.has(s.group)) { const g = grpById.get(s.group); return { x: g.gx, y: g.gy, w: g.gw, h: g.gh }; }
    if (s) return { x: s.x, y: s.y, w: s.w, h: s.h };
    if (grpById.has(id)) { const g = grpById.get(id); return { x: g.gx, y: g.gy, w: g.gw, h: g.gh }; }
    return null;
  };

  for (const c of connections) {
    const fb = box(c.from, c.fromGroup), tb = box(c.to, c.toGroup);
    if (!fb || !tb) continue;
    const p1 = anchorPoint(fb, c.fromPort), p2 = anchorPoint(tb, c.toPort);
    const path = svgEl('path', { class: 'gm-edge', d: edgePath(p1, p2, true), fill: 'none', stroke: 'var(--gm-edge)', 'stroke-width': 1.5 });
    if (c.endArrow)   path.setAttribute('marker-end', 'url(#arch-arr)');
    if (c.startArrow) path.setAttribute('marker-start', 'url(#arch-arr)');
    edgeLayer.appendChild(path);
  }
}

/**
 * Group nodes by a key (null grouped under null).
 * @param {Array<object>} arr - Items.
 * @param {(item: object) => (string|null)} keyFn - Key selector.
 * @returns {Map<string|null, Array<object>>} Grouped map.
 */
function groupBy(arr, keyFn) {
  const m = new Map();
  for (const it of arr) { const k = keyFn(it) ?? null; if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
  return m;
}

/**
 * Compute a group's nesting depth (number of ancestors).
 * @param {{parent: string|null}} g - The group.
 * @param {Map<string, object>} byId - Group id -> group.
 * @returns {number} Depth (0 = top level).
 */
function groupDepth(g, byId) {
  let d = 0, p = g.parent;
  while (p && byId.has(p)) { d++; p = byId.get(p).parent; }
  return d;
}

/**
 * Inject the shared architecture arrowhead marker into the SVG defs once.
 * @param {SVGElement} nodeLayer - A layer whose owning SVG receives the marker.
 * @returns {void}
 */
function ensureMarkers(nodeLayer) {
  const svg = nodeLayer.closest('svg') ?? nodeLayer.ownerSVGElement;
  if (!svg || svg.querySelector('#arch-arr')) return;
  let defs = svg.querySelector('defs');
  if (!defs) { defs = svgEl('defs'); svg.insertBefore(defs, svg.firstChild); }
  const m = svgEl('marker', { id: 'arch-arr', markerWidth: 10, markerHeight: 7, refX: 9, refY: 3.5, orient: 'auto-start-reverse' });
  m.appendChild(svgEl('polygon', { points: '0 0,10 3.5,0 7', fill: 'var(--gm-edge)' }));
  defs.appendChild(m);
}
