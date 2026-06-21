/**
 * @file Renders an ArchitectureAST into SVG.
 *
 * Auto-lays services on a near-square grid, draws dashed group backgrounds
 * behind their members, and connects service ports with bezier edges carrying
 * arrow markers at both ends. Services are draggable when an interaction
 * helper is supplied, with connections redrawn on drag.
 */
import { svgEl } from '../../core/renderer.js';
import { anchorPoint, sideToward, edgePath } from '../../core/edges.js';

// Service box size and grid gaps (SVG user units); PAD is the outer margin.
const SVC_W = 120, SVC_H = 70, H_GAP = 60, V_GAP = 60, PAD = 50;
// Icon keyword → OKLCH hue, giving each service type a consistent color.
const ICON_HUES = { database: 45, server: 220, internet: 155, cloud: 90, queue: 330, storage: 270 };

/**
 * Resolve a fill color for a service from its icon keyword.
 * @param {string} icon - Icon keyword (e.g. 'database', 'server').
 * @returns {string} OKLCH color string; defaults to the server hue when unknown.
 */
function svcColor(icon) {
  const h = ICON_HUES[icon?.toLowerCase()] ?? 220;
  return `oklch(0.42 0.10 ${h})`;
}

/**
 * Draw (or redraw) all connection edges into the edge layer.
 *
 * Defines a shared arrow marker, then for each connection anchors to the
 * declared L/R/T/B port of each service (auto-picking the facing side when a
 * port is omitted) and routes a bezier that leaves perpendicular to that side.
 * Called on initial render and again after a service drag to keep edges attached.
 *
 * @param {{ connections: Array<{from:string, fromPort:string, to:string, toPort:string}> }} ast - Parsed architecture AST.
 * @param {SVGElement} edgeLayer - Layer cleared and repopulated with edges.
 * @param {Map<string, {x:number, y:number}>} svcMap - Service id → positioned service.
 * @returns {void}
 */
function drawConnections(ast, edgeLayer, svcMap) {
  edgeLayer.replaceChildren();
  const defs = svgEl('defs');
  const m = svgEl('marker', { id: 'arch-arr', markerWidth: '10', markerHeight: '7', refX: '9', refY: '3.5', orient: 'auto' });
  m.appendChild(svgEl('polygon', { points: '0 0,10 3.5,0 7', fill: 'var(--gm-edge)' }));
  defs.appendChild(m);
  edgeLayer.appendChild(defs);

  for (const conn of ast.connections) {
    const fs = svcMap.get(conn.from), ts = svcMap.get(conn.to);
    if (!fs || !ts) continue;
    const fromBox = { x: fs.x, y: fs.y, w: SVC_W, h: SVC_H };
    const toBox   = { x: ts.x, y: ts.y, w: SVC_W, h: SVC_H };
    // Honor the declared ports; fall back to the facing side when unspecified.
    const dx = (toBox.x + SVC_W / 2) - (fromBox.x + SVC_W / 2);
    const dy = (toBox.y + SVC_H / 2) - (fromBox.y + SVC_H / 2);
    const p1 = anchorPoint(fromBox, conn.fromPort || sideToward( dx,  dy));
    const p2 = anchorPoint(toBox,   conn.toPort   || sideToward(-dx, -dy));
    edgeLayer.appendChild(svgEl('path', {
      class: 'gm-edge', d: edgePath(p1, p2, true),
      'marker-end': 'url(#arch-arr)',
      'marker-start': 'url(#arch-arr)',
    }));
  }
}

/**
 * Render an ArchitectureAST into the given SVG layers.
 *
 * @param {{ services: Array<object>, groups: Array<object>, connections: Array<object> }} ast - Parsed architecture AST. Service objects are mutated with x/y during layout.
 * @param {SVGElement} nodeLayer - Layer that receives group backgrounds and service nodes.
 * @param {SVGElement} edgeLayer - Layer that receives connection edges.
 * @param {{ attachDrag: (g: SVGElement, svc: object, onMove: () => void) => void }} [interact] - Optional drag helper; when present, services become draggable.
 * @returns {void}
 */
export function renderArchitecture(ast, nodeLayer, edgeLayer, interact) {
  nodeLayer.replaceChildren(); edgeLayer.replaceChildren();
  const { services, groups, connections } = ast;
  if (!services.length) return;

  // Auto-layout: place services on a near-square grid (ceil(sqrt(n)) columns).
  const COLS = Math.max(2, Math.ceil(Math.sqrt(services.length)));
  const svcMap = new Map();

  services.forEach((svc, i) => {
    svc.x = PAD + (i % COLS) * (SVC_W + H_GAP);
    svc.y = PAD + Math.floor(i / COLS) * (SVC_H + V_GAP);
    svcMap.set(svc.id, svc);
  });

  // Group backgrounds: dashed rect bounding all member services, padded out
  // (extra top padding leaves room for the group label).
  for (const grp of groups) {
    const svcs = grp.services.map(id => svcMap.get(id)).filter(Boolean);
    if (!svcs.length) continue;
    const minX = Math.min(...svcs.map(s => s.x)) - 16;
    const minY = Math.min(...svcs.map(s => s.y)) - 24;
    const maxX = Math.max(...svcs.map(s => s.x + SVC_W)) + 16;
    const maxY = Math.max(...svcs.map(s => s.y + SVC_H)) + 16;
    nodeLayer.appendChild(svgEl('rect', {
      class: 'gm-arch-group',
      x: minX, y: minY, width: maxX - minX, height: maxY - minY,
      fill: 'rgba(88,166,255,.05)', stroke: 'var(--gm-panel-border)',
      'stroke-dasharray': '6,3', rx: 8,
    }));
    nodeLayer.appendChild(svgEl('text', { class: 'gm-arch-group-label', x: minX + 8, y: minY + 14, fill: 'var(--gm-muted)', 'font-size': 10, 'pointer-events': 'none' }, grp.label));
  }

  drawConnections(ast, edgeLayer, svcMap);

  // Service nodes: a translated <g> per service so dragging only updates transform.
  for (const svc of services) {
    const color = svcColor(svc.icon);
    const g = svgEl('g', { class: 'gm-node', 'data-id': svc.id, transform: `translate(${svc.x},${svc.y})` });
    g.appendChild(svgEl('rect', { x: 0, y: 0, width: SVC_W, height: SVC_H, fill: color, rx: 8, 'stroke-width': 0 }));
    // Icon label: first two letters of the icon keyword as a lightweight glyph.
    const iconLabel = svc.icon ? svc.icon.slice(0,2).toUpperCase() : '??';
    g.appendChild(svgEl('text', { x: SVC_W/2, y: 24, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: 'rgba(255,255,255,.5)', 'font-size': '18', 'font-family': 'var(--gm-label-font)', 'pointer-events': 'none' }, iconLabel));
    g.appendChild(svgEl('text', { class: 'gm-node-text', x: SVC_W/2, y: 50, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#fff', 'font-size': '11', 'pointer-events': 'none' }, svc.label.length > 14 ? svc.label.slice(0,13)+'…' : svc.label));
    if (interact) interact.attachDrag(g, svc, () => drawConnections(ast, edgeLayer, svcMap));
    nodeLayer.appendChild(g);
  }
}
