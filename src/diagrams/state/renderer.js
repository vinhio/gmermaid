/**
 * State-diagram renderer: draws a StateAST into SVG. Auto-lays out states with
 * the shared flowchart layout, renders pseudo-states (initial/final/fork/choice)
 * and composite containers, then connects them with transition edges.
 */

import { svgEl }          from '../../core/renderer.js';
import { layoutFlowchart } from '../../core/layout.js';
import { connectBoxes }    from '../../core/edges.js';

const STATE_W  = 150; // default state box width (px)
const STATE_H  = 44;  // default state box height (px)
const COMP_PAD = 24;  // inner padding inside composite containers (px)

/**
 * Render a state diagram AST into the given SVG layers.
 * @param {object} ast - StateAST from parseState ({ states, transitions }).
 * @param {SVGElement} nodeLayer - Group element that receives state nodes.
 * @param {SVGElement} edgeLayer - Group element that receives transition edges.
 * @param {{ attachDrag: Function }} interact - Interaction helper for dragging.
 * @param {boolean} [curved=true] - Whether edges use Bézier curves.
 * @returns {void}
 */
export function renderState(ast, nodeLayer, edgeLayer, interact, curved = true) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();

  const allNodes = ast.states;
  const dir = ast.direction || 'TB';
  sizeStates(allNodes);                      // fit box sizes to content first
  expandComposites(allNodes, dir);           // lay out composites (incl. regions)
  layoutFlowchart(allNodes, ast.transitions, dir);

  const nodeEls = {};
  for (const state of allNodes) {
    const g = buildState(state, interact, () => redrawEdges(ast, edgeLayer, curved, nodeEls));
    nodeLayer.appendChild(g);
    nodeEls[state.id] = g;
  }

  redrawEdges(ast, edgeLayer, curved, nodeEls);
}

/**
 * Set each state's box size by kind (recursing into composites). Normal states
 * grow to fit their label. Composite sizes are computed later in expandComposites.
 * @param {Array<object>} states - States to size.
 * @returns {void}
 */
function sizeStates(states) {
  for (const s of states) {
    switch (s.kind) {
      case 'initial': s.w = 20; s.h = 20; break;
      case 'final':   s.w = 28; s.h = 28; break;
      case 'fork': case 'join': s.w = 90; s.h = 8; break;
      case 'choice':  s.w = 34; s.h = 34; break;
      case 'composite': if (s.children?.length) sizeStates(s.children); break;
      default:        s.w = Math.max(120, Math.ceil((s.name || s.id).length * 8 + 30)); s.h = STATE_H;
    }
  }
}

/**
 * Lay out each composite's children and size the container. Parallel regions
 * (separated by `--`) are laid out independently and stacked with divider lines.
 * @param {Array<object>} states - All top-level states.
 * @param {string} dir - Diagram flow direction.
 * @returns {void}
 */
function expandComposites(states, dir) {
  const labelH = 28; // band reserved at the top for the composite's name
  for (const s of states) {
    if (s.kind !== 'composite' || !s.children?.length) continue;
    sizeStates(s.children);
    expandComposites(s.children, s.direction || dir); // nested composites first
    const cdir = s.direction || dir;
    const childMap = new Map(s.children.map(c => [c.id, c]));
    const innerTrans = s.transitions ?? [];

    if (s.regions && s.regions.length > 1) {
      // Stack each parallel region vertically, recording divider positions.
      const dividers = [];
      let offY = COMP_PAD + labelH, maxX = 0;
      s.regions.forEach((ids, ri) => {
        const rc = ids.map(id => childMap.get(id)).filter(Boolean);
        if (!rc.length) return;
        const rt = innerTrans.filter(t => ids.includes(t.from) && ids.includes(t.to));
        layoutFlowchart(rc, rt, cdir);
        const minX = Math.min(...rc.map(c => c.x)), minY = Math.min(...rc.map(c => c.y));
        let rb = 0;
        for (const c of rc) { c.x += COMP_PAD - minX; c.y += offY - minY; maxX = Math.max(maxX, c.x + c.w); rb = Math.max(rb, c.y + c.h); }
        offY = rb + COMP_PAD;
        if (ri < s.regions.length - 1) { dividers.push(offY); offY += COMP_PAD; }
      });
      s._dividers = dividers;
      s.w = maxX + COMP_PAD;
      s.h = offY;
    } else {
      layoutFlowchart(s.children, innerTrans, cdir);
      let maxX = 0, maxY = 0;
      for (const c of s.children) { maxX = Math.max(maxX, c.x + c.w); maxY = Math.max(maxY, c.y + c.h); }
      s.w = maxX + COMP_PAD * 2;
      s.h = maxY + COMP_PAD * 2 + labelH;
      for (const c of s.children) { c.x += COMP_PAD; c.y += COMP_PAD + labelH; }
    }
  }
}

/**
 * Build a state node `<g>` whose visual depends on its kind, wiring drag for
 * draggable kinds and recursing into composite children.
 * @param {object} state - State AST entry.
 * @param {{ attachDrag: Function }} interact - Interaction helper.
 * @param {() => void} onMove - Callback to redraw edges after a drag.
 * @returns {SVGGElement} The positioned state group.
 */
function buildState(state, interact, onMove) {
  const g = svgEl('g', {
    class: 'gm-state-node',
    'data-id': state.id,
    transform: `translate(${state.x},${state.y})`,
  });

  switch (state.kind) {
    case 'initial': {
      g.appendChild(svgEl('circle', { class: 'gm-state-initial', cx: 10, cy: 10, r: 10 }));
      break;
    }
    case 'final': {
      // Final state: an outer ring with a filled inner dot (UML bullseye).
      g.appendChild(svgEl('circle', { class: 'gm-state-final-ring', cx: 14, cy: 14, r: 13 }));
      g.appendChild(svgEl('circle', { class: 'gm-state-final-dot',  cx: 14, cy: 14, r: 8 }));
      break;
    }
    case 'fork':
    case 'join': {
      g.appendChild(svgEl('rect', { class: 'gm-state-fork', x: 0, y: 0, width: state.w, height: state.h, rx: 3 }));
      break;
    }
    case 'choice': {
      // Choice pseudo-state: a diamond (decision point).
      const m = state.w / 2;
      g.appendChild(svgEl('polygon', { class: 'gm-state-choice', points: `${m},0 ${state.w},${m} ${m},${state.w} 0,${m}` }));
      break;
    }
    case 'composite': {
      g.appendChild(svgEl('rect', {
        class: 'gm-state-composite-bg',
        x: 0, y: 0, width: state.w, height: state.h, rx: 12,
        ...styleAttrs(state.style),
      }));
      g.appendChild(svgEl('text', { class: 'gm-state-label', x: state.w / 2, y: 20, 'text-anchor': 'middle' }, state.name));
      // Parallel-region divider lines.
      for (const dy of (state._dividers ?? [])) {
        g.appendChild(svgEl('line', { x1: 0, y1: dy, x2: state.w, y2: dy, stroke: 'var(--gm-muted)', 'stroke-width': 1, 'stroke-dasharray': '5,4' }));
      }
      // Render children inside (each draggable, positioned relative to composite).
      for (const child of (state.children ?? [])) {
        const cg = buildState(child, interact, onMove);
        g.appendChild(cg);
        interact.attachDrag(cg, child, onMove);
      }
      break;
    }
    default: {
      g.appendChild(svgEl('rect', {
        class: 'gm-state-bg',
        x: 0, y: 0, width: state.w, height: state.h, rx: 10,
        ...styleAttrs(state.style),
      }));
      g.appendChild(svgEl('text', {
        class: 'gm-state-label',
        x: state.w / 2, y: state.h / 2,
        'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, state.name));
    }
  }

  // Note box, attached inside the group so it drags with the state.
  if (state.note) g.appendChild(buildStateNote(state));

  // Composite drag is handled per-child above; the container itself is fixed.
  if (state.kind !== 'composite') {
    interact.attachDrag(g, state, onMove);
  }

  return g;
}

/**
 * Convert a parsed style object into fill/stroke SVG attributes.
 * @param {object} [style] - Style map (e.g. { fill, stroke, 'stroke-width', color }).
 * @returns {object} SVG attributes to spread onto a shape (empty when no style).
 */
function styleAttrs(style) {
  if (!style) return {};
  const a = {};
  if (style.fill)   a.fill = style.fill;
  if (style.stroke) a.stroke = style.stroke;
  if (style['stroke-width']) a['stroke-width'] = style['stroke-width'];
  return a;
}

/**
 * Build a note box attached to a state (local coords), to its left or right,
 * with a dotted connector. Supports multi-line text.
 * @param {object} state - The state ({ note, noteSide, w, h }).
 * @returns {SVGGElement} The note group.
 */
function buildStateNote(state) {
  const lines = String(state.note).split('\n');
  const nw = Math.max(80, ...lines.map(l => l.length * 6.4 + 16));
  const nh = lines.length * 15 + 12;
  const right = state.noteSide !== 'left';
  const nx = right ? state.w + 32 : -nw - 32;
  const ny = Math.max(0, (state.h - nh) / 2);

  const g = svgEl('g', { class: 'gm-state-note' });
  g.appendChild(svgEl('line', {
    x1: right ? state.w : 0, y1: state.h / 2, x2: right ? nx : nx + nw, y2: ny + nh / 2,
    stroke: 'var(--gm-pk)', 'stroke-width': 1, 'stroke-dasharray': '3,3',
  }));
  g.appendChild(svgEl('rect', { x: nx, y: ny, width: nw, height: nh, rx: 3, fill: 'var(--gm-header)', stroke: 'var(--gm-pk)', 'stroke-width': 1, 'stroke-dasharray': '3,2' }));
  const t = svgEl('text', { x: nx + 8, y: ny + 15, fill: 'var(--gm-muted)', 'font-family': 'var(--gm-font)', 'font-size': 11, 'pointer-events': 'none' });
  lines.forEach((ln, idx) => t.appendChild(svgEl('tspan', { x: nx + 8, dy: idx === 0 ? 0 : 15 }, ln)));
  g.appendChild(t);
  return g;
}

/**
 * Clear and redraw all transition edges (including self-loops), resolving both
 * top-level states and composite children to absolute coordinates.
 * @param {object} ast - StateAST with up-to-date positions.
 * @param {SVGElement} edgeLayer - Group element to repopulate.
 * @param {boolean} curved - Whether to draw Bézier curves vs. orthogonal lines.
 * @param {Object<string, SVGGElement>} nodeEls - Map of state id to its rendered group (unused for geometry; kept for callers).
 * @returns {void}
 */
function redrawEdges(ast, edgeLayer, curved, nodeEls) {
  edgeLayer.replaceChildren();
  const stateMap = new Map(ast.states.map(s => [s.id, s]));
  // Add composite children, converting their local coords to absolute so
  // transitions that target nested states can be routed.
  for (const s of ast.states) {
    if (s.kind === 'composite') {
      for (const c of (s.children ?? [])) {
        if (!stateMap.has(c.id)) {
          stateMap.set(c.id, { ...c, x: s.x + c.x, y: s.y + c.y });
        }
      }
    }
  }

  for (const tr of ast.transitions) {
    const a = stateMap.get(tr.from);
    const b = stateMap.get(tr.to);
    if (!a || !b) continue;

    const aw = a.w ?? STATE_W, ah = a.h ?? STATE_H;
    const bw = b.w ?? STATE_W, bh = b.h ?? STATE_H;

    let d, mx, my;
    if (tr.from === tr.to) {
      // Self-loop: a Bézier that exits and re-enters the right side, bulging out.
      const ay = a.y + ah / 2, lx = a.x + aw;
      d = `M${lx},${ay - 10} C${lx+50},${ay-50} ${lx+50},${ay+50} ${lx},${ay+10}`;
      mx = lx + 50; my = ay;
    } else {
      // Four-sided routing: anchor each end to the box side facing the other
      // state, so vertical layouts connect bottom→top.
      const A = { x: a.x, y: a.y, w: aw, h: ah };
      const B = { x: b.x, y: b.y, w: bw, h: bh };
      ({ d, mx, my } = connectBoxes(A, B, curved));
    }

    const g = svgEl('g', { class: 'gm-state-edge', 'data-from': tr.from, 'data-to': tr.to });
    g.appendChild(svgEl('path', { class: 'gm-edge', d, 'marker-end': 'url(#gm-arrow)' }));

    if (tr.label) {
      g.appendChild(svgEl('rect', { x: mx - 30, y: my - 10, width: 60, height: 18, rx: 4, fill: 'var(--gm-panel)' }));
      g.appendChild(svgEl('text', { class: 'gm-edge-label', x: mx, y: my + 4, 'text-anchor': 'middle' }, tr.label));
    }

    edgeLayer.appendChild(g);
  }
}
