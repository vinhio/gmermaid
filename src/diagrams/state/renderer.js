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
  layoutFlowchart(allNodes, ast.transitions, 'TB');
  expandComposites(allNodes, ast.transitions);

  const nodeEls = {};
  for (const state of allNodes) {
    const g = buildState(state, interact, () => redrawEdges(ast, edgeLayer, curved, nodeEls));
    nodeLayer.appendChild(g);
    nodeEls[state.id] = g;
  }

  redrawEdges(ast, edgeLayer, curved, nodeEls);
}

/**
 * Lay out each composite state's children and size the container to fit them
 * (plus padding and a label band), then offset children to sit inside.
 * @param {Array<object>} states - All top-level states.
 * @param {Array<object>} transitions - Top-level transitions (unused here; child layout uses each composite's own transitions).
 * @returns {void}
 */
function expandComposites(states, transitions) {
  for (const s of states) {
    if (s.kind !== 'composite' || !s.children?.length) continue;
    const childTrans = s.transitions ?? [];
    layoutFlowchart(s.children, childTrans, 'TB');

    // Find the children's bounding extent to size the container.
    let maxX = 0, maxY = 0;
    for (const c of s.children) {
      maxX = Math.max(maxX, c.x + (c.w ?? STATE_W));
      maxY = Math.max(maxY, c.y + (c.h ?? STATE_H));
    }

    const labelH = 28; // band reserved at the top for the composite's name
    s.w = maxX + COMP_PAD * 2;
    s.h = maxY + COMP_PAD * 2 + labelH;

    // Shift children down/right so they sit inside the padding and below the label.
    for (const c of s.children) {
      c.x += COMP_PAD;
      c.y += COMP_PAD + labelH;
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
      state.w = 20; state.h = 20;
      g.appendChild(svgEl('circle', { class: 'gm-state-initial', cx: 10, cy: 10, r: 10 }));
      break;
    }
    case 'final': {
      // Final state: an outer ring with a filled inner dot (UML bullseye).
      state.w = 28; state.h = 28;
      g.appendChild(svgEl('circle', { class: 'gm-state-final-ring', cx: 14, cy: 14, r: 13 }));
      g.appendChild(svgEl('circle', { class: 'gm-state-final-dot',  cx: 14, cy: 14, r: 8 }));
      break;
    }
    case 'fork':
    case 'join': {
      state.w = 80; state.h = 6;
      g.appendChild(svgEl('rect', { class: 'gm-state-fork', x: 0, y: 0, width: 80, height: 6, rx: 3 }));
      break;
    }
    case 'choice': {
      // Choice pseudo-state: a 30x30 diamond (decision point).
      state.w = 30; state.h = 30;
      g.appendChild(svgEl('polygon', { class: 'gm-state-choice', points: '15,0 30,15 15,30 0,15' }));
      break;
    }
    case 'composite': {
      g.appendChild(svgEl('rect', {
        class: 'gm-state-composite-bg',
        x: 0, y: 0, width: state.w ?? 200, height: state.h ?? 120, rx: 12,
      }));
      g.appendChild(svgEl('text', { class: 'gm-state-label', x: (state.w ?? 200) / 2, y: 20, 'text-anchor': 'middle' }, state.name));
      // Render children inside
      for (const child of (state.children ?? [])) {
        const cg = buildState(child, interact, onMove);
        g.appendChild(cg);
        // Attach drag to child, positioned relative to composite
        interact.attachDrag(cg, child, onMove);
      }
      break;
    }
    default: {
      state.w = state.w || STATE_W;
      state.h = state.h || STATE_H;
      g.appendChild(svgEl('rect', {
        class: 'gm-state-bg',
        x: 0, y: 0, width: state.w, height: state.h, rx: 10,
      }));
      g.appendChild(svgEl('text', {
        class: 'gm-state-label',
        x: state.w / 2, y: state.h / 2,
        'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, state.name));
    }
  }

  // Composite drag is handled per-child above; the container itself is fixed.
  if (state.kind !== 'composite') {
    interact.attachDrag(g, state, onMove);
  }

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
