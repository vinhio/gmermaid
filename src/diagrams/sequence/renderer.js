/**
 * Sequence renderer: draws a SequenceAST into SVG. Participants get top and
 * bottom boxes joined by dashed lifelines; steps are laid out top-to-bottom by
 * advancing a shared vertical cursor. Unlike the other diagrams this layout is
 * fully computed (no dragging), so the `interact`/`curved` args are unused.
 *
 * Supports the documented Mermaid sequence features: messages (incl.
 * bidirectional/async arrows), activations (incl. nested), notes, control
 * blocks (loop/alt/opt/par/critical/break), rect highlights, participant boxes,
 * create/destroy lifecycle, and autonumber.
 */

import { svgEl } from '../../core/renderer.js';

const PART_W   = 130;          // participant box width (px)
const PART_H   = 40;           // participant box height (px)
const PART_GAP = 170;          // horizontal distance between participant centers (px)
const MARGIN_X = 50;           // left margin before the first participant (px)
const START_Y  = PART_H + 24;  // y where the first step begins (below top boxes)
const ROW_H    = 52;           // vertical advance per message row (px)
const NOTE_H   = 36;           // base note box height (px)
const ACT_W    = 8;            // activation bar width (px)
const GROUP_PAD = 20;          // inner padding around a group frame (px)
const LINE_H   = 15;           // line height for multi-line (<br/>) text (px)

/**
 * Render a sequence diagram AST into the given SVG layers.
 * @param {object} ast - SequenceAST from parseSequence ({ participants, boxes, autonumber, steps }).
 * @param {SVGElement} nodeLayer - Group element that receives all drawn content.
 * @param {SVGElement} edgeLayer - Cleared but unused (sequence draws into nodeLayer sublayers).
 * @param {*} _interact - Unused; sequence diagrams are not draggable.
 * @param {*} _curved - Unused; sequence routing is fixed.
 * @returns {void}
 */
export function renderSequence(ast, nodeLayer, edgeLayer, _interact, _curved) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();

  const { participants, steps } = ast;
  if (!participants.length) return;

  // Assign each participant a fixed center x by index.
  participants.forEach((p, i) => {
    p.cx = MARGIN_X + PART_W / 2 + i * PART_GAP;
    p.w  = PART_W;
  });
  const pMap = new Map(participants.map(p => [p.id, p]));

  // Add SVG markers for sequence arrows into a local defs element
  const defs = svgEl('defs');
  addSeqMarkers(defs);
  nodeLayer.appendChild(defs);

  // `cursor.y` advances as steps are laid out; passed by reference into helpers.
  const cursor = { y: START_Y };
  // Per-participant stack of open activation start-Ys (supports nesting).
  const activations = new Map(participants.map(p => [p.id, []]));

  // Layers (paint order: boxes & frames behind, then lifelines, messages, boxes)
  const boxG     = svgEl('g', { class: 'gm-seq-boxes'     });
  const frameG   = svgEl('g', { class: 'gm-seq-frames'    });
  const lifeG    = svgEl('g', { class: 'gm-seq-lifelines' });
  const msgG     = svgEl('g', { class: 'gm-seq-messages'  });
  const partG    = svgEl('g', { class: 'gm-seq-parts'     });

  nodeLayer.appendChild(boxG);
  nodeLayer.appendChild(frameG);
  nodeLayer.appendChild(lifeG);
  nodeLayer.appendChild(msgG);
  nodeLayer.appendChild(partG);

  // Top participant heads (stick figure for actors, box otherwise)
  for (const p of participants) {
    partG.appendChild(buildHead(p, 0));
  }

  // Shared render context. `seq` carries the autonumber counter (or null);
  // `destroyed` records the y at which each destroyed lifeline ends.
  const ctx = {
    frameG, msgG, activations,
    seq: ast.autonumber ? { n: ast.autonumber.start, step: ast.autonumber.step } : null,
    destroyed: new Map(),
  };

  // Process steps
  renderSteps(steps, cursor, pMap, ctx);

  const totalH = cursor.y + GROUP_PAD + PART_H;

  // Lifelines — end early at a destroy point when present.
  for (const p of participants) {
    const y2 = ctx.destroyed.has(p.id) ? ctx.destroyed.get(p.id) : totalH - PART_H;
    lifeG.appendChild(svgEl('line', {
      class: 'gm-seq-lifeline',
      x1: p.cx, y1: PART_H, x2: p.cx, y2,
      stroke: 'var(--gm-muted)', 'stroke-width': 1.5, 'stroke-dasharray': '6,4',
    }));
  }

  // Flush any unclosed activation bars
  for (const [id, stack] of activations) {
    const p = pMap.get(id);
    if (!p) continue;
    while (stack.length) {
      const startY = stack.pop();
      msgG.appendChild(buildActivationBar(p.cx, startY, cursor.y, stack.length));
    }
  }

  // Participant boxes (colored frames grouping consecutive participants).
  for (const box of (ast.boxes ?? [])) {
    const ps = box.participants.map(id => pMap.get(id)).filter(Boolean);
    if (!ps.length) continue;
    const minCx = Math.min(...ps.map(p => p.cx));
    const maxCx = Math.max(...ps.map(p => p.cx));
    const x = minCx - PART_W / 2 - 8;
    const w = (maxCx - minCx) + PART_W + 16;
    boxG.appendChild(svgEl('rect', {
      x, y: 0, width: w, height: totalH, rx: 6,
      fill: boxFill(box.color), stroke: 'var(--gm-panel-border)', 'stroke-width': 1,
    }));
    if (box.label) {
      boxG.appendChild(svgEl('text', {
        x: x + 8, y: 14, fill: 'var(--gm-muted)',
        'font-family': 'var(--gm-label-font)', 'font-size': 11, 'font-weight': 600,
      }, box.label));
    }
  }

  // Bottom participant heads (mirrored) — skip destroyed participants.
  for (const p of participants) {
    if (ctx.destroyed.has(p.id)) continue;
    partG.appendChild(buildHead(p, totalH - PART_H));
  }
}

// ─── Steps renderer ───────────────────────────────────────────────────────────

/**
 * Dispatch each step to its specific renderer, advancing the shared cursor.
 * @param {Array<object>} steps - Ordered step list (may be a group branch).
 * @param {{ y: number }} cursor - Mutable vertical cursor.
 * @param {Map<string, object>} pMap - Participant id -> participant lookup.
 * @param {{ frameG: SVGGElement, msgG: SVGGElement, activations: Map<string, number[]>, seq: object|null, destroyed: Map<string, number> }} ctx - Shared render context/layers.
 * @returns {void}
 */
function renderSteps(steps, cursor, pMap, ctx) {
  for (const step of steps) {
    switch (step.kind) {
      case 'message':   renderMessage(step, cursor, pMap, ctx); break;
      case 'note':      renderNote(step, cursor, pMap, ctx.msgG); break;
      case 'activate':  { const p = pMap.get(step.participant); if (p) ctx.activations.get(p.id)?.push(cursor.y); break; }
      case 'deactivate':renderDeactivate(step, cursor, pMap, ctx.msgG, ctx.activations); break;
      case 'destroy':   renderDestroy(step, cursor, pMap, ctx); break;
      case 'rect':      renderRect(step, cursor, pMap, ctx); break;
      case 'group':     renderGroup(step, cursor, pMap, ctx); break;
    }
  }
}

/**
 * Render one message arrow (straight between participants, or a self-loop) with
 * its text label and optional autonumber badge, advancing the cursor by one row.
 * @param {object} step - Message step ({ from, to, text, arrow }).
 * @param {{ y: number }} cursor - Mutable vertical cursor.
 * @param {Map<string, object>} pMap - Participant lookup.
 * @param {{ msgG: SVGGElement, seq: object|null }} ctx - Shared render context.
 * @returns {void}
 */
function renderMessage(step, cursor, pMap, ctx) {
  const fromP = pMap.get(step.from);
  const toP   = pMap.get(step.to);
  if (!fromP || !toP) { cursor.y += ROW_H; return; }

  const y = cursor.y + ROW_H / 2;
  cursor.y += ROW_H;

  const dashed = isDashed(step.arrow);
  const endMarker = markerUrl(step.arrow);
  const bidir = step.arrow.startsWith('<<'); // arrowhead at both ends
  const label = splitText(step.text).join(' ');

  const g = svgEl('g', { class: 'gm-seq-message' });

  if (step.from === step.to) {
    // Self-message: draw a rectangular loop bulging `lp` px to the right,
    // `dy` px tall, returning to the same lifeline.
    const cx  = fromP.cx;
    const lp  = 60;
    const dy  = ROW_H * 0.6;
    const d   = `M${cx},${y} L${cx+lp},${y} L${cx+lp},${y+dy} L${cx},${y+dy}`;
    const path = svgEl('path', {
      d, fill: 'none',
      stroke: 'var(--gm-edge)', 'stroke-width': 1.5,
      ...(dashed ? { 'stroke-dasharray': '6,4' } : {}),
    });
    if (endMarker) path.setAttribute('marker-end', endMarker);
    g.appendChild(path);
    g.appendChild(svgEl('text', {
      x: cx + lp + 6, y: y + dy / 2 + 4,
      fill: 'var(--gm-text)', 'font-family': 'var(--gm-font)', 'font-size': 11,
    }, label));
  } else {
    const x1 = fromP.cx, x2 = toP.cx;
    const line = svgEl('line', {
      x1, y1: y, x2, y2: y,
      stroke: 'var(--gm-edge)', 'stroke-width': 1.5,
      ...(dashed ? { 'stroke-dasharray': '6,4' } : {}),
    });
    if (endMarker) line.setAttribute('marker-end', endMarker);
    if (bidir)     line.setAttribute('marker-start', 'url(#gm-seq-arrow-filled)');
    g.appendChild(line);
    const mx = (x1 + x2) / 2;
    g.appendChild(svgEl('text', {
      x: mx, y: y - 6,
      'text-anchor': 'middle', fill: 'var(--gm-text)',
      'font-family': 'var(--gm-font)', 'font-size': 11,
    }, label));
  }

  // Autonumber badge at the message source.
  if (ctx.seq) {
    drawSeqNumber(g, fromP.cx, y, ctx.seq.n);
    ctx.seq.n += ctx.seq.step;
  }

  ctx.msgG.appendChild(g);
}

/**
 * Render a note box (left of, right of, or spanning over participants),
 * supporting `<br/>` line breaks.
 * @param {object} step - Note step ({ position, participants, text }).
 * @param {{ y: number }} cursor - Mutable vertical cursor.
 * @param {Map<string, object>} pMap - Participant lookup.
 * @param {SVGGElement} msgG - Layer to append the note to.
 * @returns {void}
 */
function renderNote(step, cursor, pMap, msgG) {
  const ids  = step.participants;
  const ps   = ids.map(id => pMap.get(id)).filter(Boolean);
  if (!ps.length) { cursor.y += NOTE_H + 10; return; }

  const textLines = splitText(step.text);
  const h = Math.max(NOTE_H, textLines.length * LINE_H + 14);
  const y = cursor.y;
  cursor.y += h + 10;

  let x, w;
  if (step.position === 'left') {
    x = ps[0].cx - PART_W / 2 - 90;
    w = 86;
  } else if (step.position === 'right') {
    x = ps[0].cx + PART_W / 2 + 4;
    w = 86;
  } else {
    // 'over': span from the leftmost to the rightmost covered participant,
    // padded half a box on each side.
    const minCx = Math.min(...ps.map(p => p.cx));
    const maxCx = Math.max(...ps.map(p => p.cx));
    x = minCx - PART_W / 2;
    w = maxCx - minCx + PART_W;
  }

  const g = svgEl('g', { class: 'gm-seq-note' });
  g.appendChild(svgEl('rect', {
    x, y, width: w, height: h, rx: 4,
    fill: 'var(--gm-header)', stroke: 'var(--gm-panel-border)', 'stroke-width': 1,
  }));
  // Vertically center the block of text lines within the box.
  const firstY = y + (h - (textLines.length - 1) * LINE_H) / 2 + 4;
  const textEl = svgEl('text', {
    x: x + w / 2, y: firstY,
    'text-anchor': 'middle', fill: 'var(--gm-muted)',
    'font-family': 'var(--gm-font)', 'font-size': 11,
  });
  textLines.forEach((ln, idx) => {
    textEl.appendChild(svgEl('tspan', { x: x + w / 2, dy: idx === 0 ? 0 : LINE_H }, ln));
  });
  g.appendChild(textEl);
  msgG.appendChild(g);
}

/**
 * Close the most recent open activation for a participant, drawing its bar.
 * @param {object} step - Deactivate step ({ participant }).
 * @param {{ y: number }} cursor - Mutable vertical cursor (supplies the bar's end y).
 * @param {Map<string, object>} pMap - Participant lookup.
 * @param {SVGGElement} msgG - Layer to append the activation bar to.
 * @param {Map<string, number[]>} activations - Per-participant activation start-Y stacks.
 * @returns {void}
 */
function renderDeactivate(step, cursor, pMap, msgG, activations) {
  const p = pMap.get(step.participant);
  if (!p) return;
  const stack = activations.get(p.id);
  if (stack && stack.length) {
    const startY = stack.pop();
    // Remaining stack depth = this bar's nesting level (0 = outermost).
    msgG.appendChild(buildActivationBar(p.cx, startY, cursor.y, stack.length));
  }
}

/**
 * Render a participant destruction: a cross on the lifeline and a record so the
 * lifeline ends here and no bottom box is drawn.
 * @param {object} step - Destroy step ({ participant }).
 * @param {{ y: number }} cursor - Mutable vertical cursor (destruction y).
 * @param {Map<string, object>} pMap - Participant lookup.
 * @param {{ msgG: SVGGElement, destroyed: Map<string, number> }} ctx - Shared render context.
 * @returns {void}
 */
function renderDestroy(step, cursor, pMap, ctx) {
  const p = pMap.get(step.participant);
  if (!p) return;
  ctx.destroyed.set(p.id, cursor.y);
  const s = 7;
  const g = svgEl('g', { class: 'gm-seq-destroy' });
  g.appendChild(svgEl('line', { x1: p.cx - s, y1: cursor.y - s, x2: p.cx + s, y2: cursor.y + s, stroke: 'var(--gm-edge)', 'stroke-width': 2 }));
  g.appendChild(svgEl('line', { x1: p.cx + s, y1: cursor.y - s, x2: p.cx - s, y2: cursor.y + s, stroke: 'var(--gm-edge)', 'stroke-width': 2 }));
  ctx.msgG.appendChild(g);
}

/**
 * Render a `rect` background highlight around its inner steps.
 * @param {object} step - Rect step ({ color, steps }).
 * @param {{ y: number }} cursor - Mutable vertical cursor.
 * @param {Map<string, object>} pMap - Participant lookup.
 * @param {{ frameG: SVGGElement }} ctx - Shared render context.
 * @returns {void}
 */
function renderRect(step, cursor, pMap, ctx) {
  const startY = cursor.y;
  cursor.y += 8;
  renderSteps(step.steps, cursor, pMap, ctx);
  cursor.y += 8;
  const endY = cursor.y;

  const allX = [...pMap.values()].map(p => p.cx);
  const fx = Math.min(...allX) - PART_W / 2 - 10;
  const fw = Math.max(...allX) - Math.min(...allX) + PART_W + 20;
  // Appended to frameG, which paints behind the message layer.
  ctx.frameG.appendChild(svgEl('rect', {
    x: fx, y: startY, width: fw, height: endY - startY, rx: 4, fill: step.color,
  }));
}

/**
 * Render a grouping block (alt/loop/opt/par/critical/break): lays out each
 * branch (with a dashed separator between branches), then draws the enclosing
 * frame and its type tag behind the content.
 * @param {object} step - Group step ({ type, label, branches }).
 * @param {{ y: number }} cursor - Mutable vertical cursor.
 * @param {Map<string, object>} pMap - Participant lookup.
 * @param {{ frameG: SVGGElement, msgG: SVGGElement }} ctx - Shared render context.
 * @returns {void}
 */
function renderGroup(step, cursor, pMap, ctx) {
  const startY = cursor.y;
  cursor.y += GROUP_PAD;

  for (let bi = 0; bi < step.branches.length; bi++) {
    const branch = step.branches[bi];
    if (bi > 0) {
      // Branch separator (else / and / option)
      const sepY = cursor.y;
      const allX = [...pMap.values()].map(p => p.cx);
      const x1 = Math.min(...allX) - PART_W / 2 - 10;
      const x2 = Math.max(...allX) + PART_W / 2 + 10;
      const sepLine = svgEl('line', {
        x1, y1: sepY, x2, y2: sepY,
        stroke: 'var(--gm-muted)', 'stroke-width': 1, 'stroke-dasharray': '4,3',
      });
      const sepLabel = svgEl('text', {
        x: x1 + 6, y: sepY + 12,
        fill: 'var(--gm-muted)', 'font-family': 'var(--gm-font)', 'font-size': 10,
      }, branch.label || sepKeyword(step.type));
      ctx.msgG.appendChild(sepLine);
      ctx.msgG.appendChild(sepLabel);
      cursor.y += 16;
    }
    renderSteps(branch.steps, cursor, pMap, ctx);
  }

  cursor.y += GROUP_PAD;
  const endY = cursor.y;

  // Frame spans all participants horizontally (10px outside the outer boxes);
  // appended to frameG which sits behind the message layer.
  const allX = [...pMap.values()].map(p => p.cx);
  const fx = Math.min(...allX) - PART_W / 2 - 10;
  const fw = Math.max(...allX) - Math.min(...allX) + PART_W + 20;

  const frameRect = svgEl('rect', {
    x: fx, y: startY, width: fw, height: endY - startY,
    fill: 'none', stroke: 'var(--gm-muted)', 'stroke-width': 1, 'stroke-dasharray': '5,3',
    rx: 4,
  });
  ctx.frameG.appendChild(frameRect);

  // Label tag in the top-left corner; width estimated from the type text length.
  const tagW = Math.max(40, step.type.length * 7 + 8);
  ctx.frameG.appendChild(svgEl('rect', {
    x: fx, y: startY, width: tagW, height: 18, rx: '3 0 0 3',
    fill: 'var(--gm-header)', stroke: 'var(--gm-muted)', 'stroke-width': 1,
  }));
  ctx.frameG.appendChild(svgEl('text', {
    x: fx + tagW / 2, y: startY + 12,
    'text-anchor': 'middle', fill: 'var(--gm-accent)',
    'font-family': 'var(--gm-font)', 'font-size': 10, 'font-weight': 700,
  }, step.type.toUpperCase()));

  if (step.label && step.type !== 'loop') return; // already shown in branch labels
  if (step.label) {
    ctx.frameG.appendChild(svgEl('text', {
      x: fx + tagW + 6, y: startY + 12,
      fill: 'var(--gm-muted)', 'font-family': 'var(--gm-font)', 'font-size': 10,
    }, step.label));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a participant's head element by type: a stick figure for `actor`,
 * a labeled box otherwise. Used for both the top and mirrored bottom rows.
 * @param {object} p - Participant ({ cx, name, type }).
 * @param {number} y - Top y of the head band.
 * @returns {SVGGElement} The head group.
 */
function buildHead(p, y) {
  return p.type === 'actor' ? buildActor(p, y) : buildParticipant(p, y);
}

/**
 * Build a stick-figure actor (head, body, arms, legs) with its name beneath,
 * fitted within the PART_H band so lifelines still attach at the band edges.
 * @param {object} p - Participant ({ cx, name }).
 * @param {number} y - Top y of the head band.
 * @returns {SVGGElement} The actor group.
 */
function buildActor(p, y) {
  const cx = p.cx;
  const stroke = 'var(--gm-text)';
  const limb = { fill: 'none', stroke, 'stroke-width': 1.5, 'stroke-linecap': 'round' };

  const g = svgEl('g', { class: 'gm-seq-actor' });
  g.appendChild(svgEl('circle', { cx, cy: y + 6, r: 5, fill: 'var(--gm-panel)', stroke, 'stroke-width': 1.5 })); // head
  g.appendChild(svgEl('line', { x1: cx, y1: y + 11, x2: cx, y2: y + 22, ...limb }));        // body
  g.appendChild(svgEl('line', { x1: cx - 9, y1: y + 15, x2: cx + 9, y2: y + 15, ...limb })); // arms
  g.appendChild(svgEl('line', { x1: cx, y1: y + 22, x2: cx - 7, y2: y + 29, ...limb }));     // left leg
  g.appendChild(svgEl('line', { x1: cx, y1: y + 22, x2: cx + 7, y2: y + 29, ...limb }));     // right leg
  g.appendChild(svgEl('text', {
    x: cx, y: y + PART_H - 1,
    'text-anchor': 'middle', fill: 'var(--gm-text)',
    'font-family': 'var(--gm-font)', 'font-size': 11, 'font-weight': 600,
  }, p.name));
  return g;
}

/**
 * Build a participant box (used for both the top and mirrored bottom boxes).
 * @param {object} p - Participant ({ cx, name }).
 * @param {number} y - Top y of the box.
 * @returns {SVGGElement} The participant group.
 */
function buildParticipant(p, y) {
  const g = svgEl('g', { class: 'gm-seq-participant' });
  g.appendChild(svgEl('rect', {
    x: p.cx - PART_W / 2, y, width: PART_W, height: PART_H, rx: 6,
    fill: 'var(--gm-panel)', stroke: 'var(--gm-panel-border)', 'stroke-width': 1.5,
  }));
  g.appendChild(svgEl('text', {
    x: p.cx, y: y + PART_H / 2 + 4,
    'text-anchor': 'middle', fill: 'var(--gm-text)',
    'font-family': 'var(--gm-font)', 'font-size': 12, 'font-weight': 600,
  }, p.name));
  return g;
}

/**
 * Build the rectangular activation bar on a participant's lifeline. Nested bars
 * are shifted right by their depth so overlapping activations stay distinct.
 * @param {number} cx - Lifeline x (the outermost bar is centered on it).
 * @param {number} startY - Top y of the bar.
 * @param {number} endY - Bottom y of the bar (min 4px tall).
 * @param {number} [depth=0] - Nesting level (0 = outermost); shifts the bar right.
 * @returns {SVGRectElement} The activation bar.
 */
function buildActivationBar(cx, startY, endY, depth = 0) {
  const h = Math.max(endY - startY, 4);
  return svgEl('rect', {
    x: cx - ACT_W / 2 + depth * (ACT_W / 2), y: startY,
    width: ACT_W, height: h, rx: 2,
    fill: 'var(--gm-accent)', opacity: 0.7,
    stroke: 'var(--gm-accent-dim)', 'stroke-width': 1,
  });
}

/**
 * Append a small numbered badge (autonumber) to a message group.
 * @param {SVGGElement} g - The message group to append into.
 * @param {number} x - Badge center x (the message source lifeline).
 * @param {number} y - Badge center y (the message line).
 * @param {number} n - The sequence number to display.
 * @returns {void}
 */
function drawSeqNumber(g, x, y, n) {
  g.appendChild(svgEl('circle', { cx: x, cy: y, r: 8, fill: 'var(--gm-accent)', opacity: 0.9 }));
  g.appendChild(svgEl('text', {
    x, y: y + 3, 'text-anchor': 'middle', fill: 'var(--gm-bg)',
    'font-family': 'var(--gm-font)', 'font-size': 9, 'font-weight': 700, 'pointer-events': 'none',
  }, String(n)));
}

/**
 * Split text on `<br/>` (and variants) into trimmed lines.
 * @param {string} s - Raw label/note text.
 * @returns {string[]} One or more text lines.
 */
function splitText(s) {
  return String(s).split(/<br\s*\/?>/i).map(t => t.trim());
}

/**
 * Resolve a `box` color keyword to an SVG fill.
 * @param {string|null} color - Color from the box header, or null for a default tint.
 * @returns {string} An SVG paint value.
 */
function boxFill(color) {
  if (!color) return 'rgba(255,255,255,0.03)';
  if (color === 'transparent') return 'transparent';
  return color;
}

/**
 * Default separator label for a multi-branch group type.
 * @param {string} type - Group type ('alt' | 'par' | 'critical' | ...).
 * @returns {string} The separator keyword shown when a branch has no label.
 */
function sepKeyword(type) {
  return type === 'par' ? 'and' : type === 'critical' ? 'option' : 'else';
}

/**
 * Whether an arrow operator denotes a dashed (reply/async) line.
 * @param {string} arrow - The arrow token (e.g. '->>', '-->>', '<<-->>').
 * @returns {boolean} True for arrows containing a `--` (dashed) segment.
 */
function isDashed(arrow) {
  return arrow.includes('--');
}

/**
 * Choose the SVG marker URL for an arrow's head style, or null for headless arrows.
 * @param {string} arrow - The arrow token.
 * @returns {string|null} A `url(#...)` reference (filled / open / X), or null for `->`/`-->`.
 */
function markerUrl(arrow) {
  if (arrow.endsWith('x')) return 'url(#gm-seq-arrow-x)';     // -x / --x : cross
  if (arrow.endsWith(')')) return 'url(#gm-seq-arrow-open)';  // -) / --) : async open head
  if (arrow.endsWith('>>')) return 'url(#gm-seq-arrow-filled)'; // ->> / -->> / <<->> : solid head
  return null;                                                // -> / --> : line only, no head
}

/**
 * Append the three reusable arrowhead markers (filled, open, X) to a defs node.
 * The filled marker uses `auto-start-reverse` so it can also serve as the
 * `marker-start` head for bidirectional arrows.
 * @param {SVGDefsElement} defs - The defs element to populate.
 * @returns {void}
 */
function addSeqMarkers(defs) {
  // Filled triangle (also reused, reversed, as a start marker for bidirectional arrows)
  const mFill = svgEl('marker', {
    id: 'gm-seq-arrow-filled', markerWidth: 10, markerHeight: 7,
    refX: 10, refY: 3.5, orient: 'auto-start-reverse',
  });
  mFill.appendChild(svgEl('path', { d: 'M0,0 L10,3.5 L0,7 Z', fill: 'var(--gm-edge)' }));
  defs.appendChild(mFill);

  // Open arrow
  const mOpen = svgEl('marker', {
    id: 'gm-seq-arrow-open', markerWidth: 10, markerHeight: 7,
    refX: 10, refY: 3.5, orient: 'auto',
  });
  mOpen.appendChild(svgEl('path', {
    d: 'M0,0 L10,3.5 L0,7', fill: 'none',
    stroke: 'var(--gm-edge)', 'stroke-width': 1.5,
  }));
  defs.appendChild(mOpen);

  // X mark
  const mX = svgEl('marker', {
    id: 'gm-seq-arrow-x', markerWidth: 10, markerHeight: 10,
    refX: 5, refY: 5, orient: 'auto',
  });
  mX.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 10, y2: 10, stroke: 'var(--gm-edge)', 'stroke-width': 1.5 }));
  mX.appendChild(svgEl('line', { x1: 10, y1: 0, x2: 0, y2: 10, stroke: 'var(--gm-edge)', 'stroke-width': 1.5 }));
  defs.appendChild(mX);
}
