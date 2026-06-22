/**
 * Renders a JourneyAST into SVG as a sectioned bar chart of task satisfaction.
 * @module diagrams/journey/renderer
 */

import { svgEl } from '../../core/renderer.js';

const TASK_W      = 120; // Horizontal width allotted to each task column.
const BAR_MAX_H   = 80;  // Pixel height of a full (score 5) satisfaction bar.
const CHART_BTM   = 180; // Y of the chart baseline; bars grow upward from here.
const PAD_LEFT    = 60;  // Left padding before the first task column.
const HUES        = [220, 160, 45, 330, 90, 270]; // Per-section background hues, cycled.

// Bar fill keyed by score 1..5 (index 0 unused so score maps directly to colour).
const SCORE_COLOR = ['', 'oklch(0.55 0.2 25)', 'oklch(0.6 0.18 45)', 'oklch(0.68 0.15 80)', 'oklch(0.62 0.17 140)', 'oklch(0.68 0.17 155)'];

/**
 * Renders a JourneyAST into the node layer. Re-rendering clears both layers first.
 * @param {ReturnType<import('./parser.js').parseJourney>} ast - Parsed journey AST.
 * @param {SVGGElement} nodeLayer - SVG group receiving the chart.
 * @param {SVGGElement} edgeLayer - SVG group for edges (cleared; unused here).
 * @returns {void}
 */
export function renderJourney(ast, nodeLayer, edgeLayer) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();

  const { title, sections } = ast;
  if (!sections.length) return;

  const totalTasks = sections.reduce((s, sec) => s + sec.tasks.length, 0);
  const totalW = PAD_LEFT + totalTasks * TASK_W + 40;

  // Map every distinct actor (first-seen order) to its own colour — the journey's
  // defining feature is that each actor has a consistent colour across all tasks.
  const actorColor = buildActorColors(sections);
  // Vertical room reserved below the chart for the per-task actor dots.
  const maxActors = Math.max(1, ...sections.flatMap(s => s.tasks.map(t => t.actors.length)));

  const g = svgEl('g');

  // Title
  if (title) {
    g.appendChild(svgEl('text', {
      class: 'gm-journey-title',
      x: totalW / 2, y: -30,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    }, title));
  }

  // Point per task (top of its bar) — collected to draw the satisfaction line.
  const linePts = [];
  let taskX = PAD_LEFT;

  for (let si = 0; si < sections.length; si++) {
    const sec   = sections[si];
    const secX0 = taskX;
    const secColor = `oklch(0.25 0.06 ${HUES[si % HUES.length]})`;
    const secW  = sec.tasks.length * TASK_W;

    // Section background
    g.appendChild(svgEl('rect', {
      class: 'gm-journey-section-bg',
      x: secX0, y: -20,
      width: secW - 2, height: CHART_BTM + 50,
      fill: secColor,
      rx: 4,
      opacity: '0.5',
    }));

    // Section label
    if (sec.label) {
      g.appendChild(svgEl('text', {
        class: 'gm-journey-section',
        x: secX0 + secW / 2, y: -6,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      }, sec.label));
    }

    for (const task of sec.tasks) {
      const bw     = TASK_W - 12;
      // Bar height scales linearly with the 1..5 score; baseline sits at CHART_BTM.
      const bh     = Math.round((task.score / 5) * BAR_MAX_H);
      const bx     = taskX + 6;
      const by     = CHART_BTM - bh;
      const color  = SCORE_COLOR[task.score] ?? SCORE_COLOR[3];

      const cx = taskX + TASK_W / 2;
      linePts.push(`${cx},${by}`);

      // Bar
      g.appendChild(svgEl('rect', {
        class: 'gm-journey-bar',
        x: bx, y: by, width: bw, height: bh,
        fill: color,
        rx: 3,
        opacity: '0.9',
      }));

      // Score badge
      g.appendChild(svgEl('text', {
        class: 'gm-journey-score',
        x: cx, y: by - 8,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      }, String(task.score)));

      // Task name (truncated with an ellipsis to fit the column width).
      const label = task.name.length > 13 ? task.name.slice(0, 12) + '…' : task.name;
      g.appendChild(svgEl('text', {
        class: 'gm-journey-task',
        x: cx, y: CHART_BTM + 16,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      }, label));

      // Actor dots — one colour-coded circle per actor on this task, centered.
      const n = task.actors.length;
      task.actors.forEach((actor, ai) => {
        g.appendChild(svgEl('circle', {
          class: 'gm-journey-actor-dot',
          cx: cx + (ai - (n - 1) / 2) * 16, cy: CHART_BTM + 34, r: 6,
          fill: actorColor.get(actor), stroke: 'var(--gm-bg)', 'stroke-width': 1.5,
        }));
      });

      taskX += TASK_W;
    }
  }

  // Axis
  g.appendChild(svgEl('line', {
    class: 'gm-journey-axis',
    x1: PAD_LEFT, y1: CHART_BTM, x2: taskX, y2: CHART_BTM,
    stroke: 'var(--gm-muted)',
    'stroke-width': '1',
  }));

  // Satisfaction line connecting consecutive task scores (the "journey").
  if (linePts.length > 1) {
    g.appendChild(svgEl('polyline', {
      class: 'gm-journey-line', points: linePts.join(' '),
      fill: 'none', stroke: 'var(--gm-muted)', 'stroke-width': 1.5, 'stroke-dasharray': '4,3', opacity: 0.8,
    }));
  }

  // Actor legend: a colour chip + name per distinct actor, below the dots.
  const legendY = CHART_BTM + 34 + (maxActors > 0 ? 24 : 0);
  let lx = PAD_LEFT;
  for (const [actor, col] of actorColor) {
    g.appendChild(svgEl('circle', { cx: lx + 6, cy: legendY, r: 6, fill: col, stroke: 'var(--gm-bg)', 'stroke-width': 1.5 }));
    const t = svgEl('text', { class: 'gm-journey-actor', x: lx + 18, y: legendY + 4 }, actor);
    g.appendChild(t);
    lx += 30 + actor.length * 7;
  }

  nodeLayer.appendChild(g);
}

/**
 * Assign each distinct actor (first-seen order across all tasks) a unique colour
 * by spreading hues evenly, so the same actor is the same colour everywhere.
 * @param {Array<{tasks: Array<{actors: string[]}>}>} sections - Journey sections.
 * @returns {Map<string, string>} Actor name -> CSS colour.
 */
function buildActorColors(sections) {
  const actors = [];
  for (const sec of sections) for (const t of sec.tasks) for (const a of t.actors) if (!actors.includes(a)) actors.push(a);
  const map = new Map();
  actors.forEach((a, i) => map.set(a, `oklch(0.66 0.17 ${Math.round((360 / Math.max(1, actors.length)) * i)})`));
  return map;
}
