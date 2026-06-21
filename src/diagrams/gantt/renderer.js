/**
 * Renders a GanttAST into SVG (date axis, section bands, task bars/milestones).
 * @module diagrams/gantt/renderer
 */
import { svgEl } from '../../core/renderer.js';

const LABEL_W = 180; // width of the left label column (px)
const BAR_H   = 22;  // task bar height
const ROW_H   = 32;  // height of one task row
const SEC_H   = 28;  // height of a section header band
const AXIS_H  = 40;  // height reserved at top for the date axis
const CHART_W = 700; // drawable width of the timeline area (after LABEL_W)

/**
 * Format a timestamp as a short `Mon DD` label (UTC).
 * @param {number} ms - UTC epoch milliseconds.
 * @returns {string} e.g. "Mar 05".
 */
function fmtDate(ms) {
  const d = new Date(ms);
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
  return `${mo} ${String(d.getUTCDate()).padStart(2,'0')}`;
}

/**
 * Format a timestamp as a full `YYYY-MM-DD` label (UTC); used for very long spans.
 * @param {number} ms - UTC epoch milliseconds.
 * @returns {string} e.g. "2024-03-05".
 */
function fmtDateLong(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth()+1).padStart(2,'0');
  const dy = String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${mo}-${dy}`;
}

/**
 * Pick a bar fill color based on task status.
 * @param {string|null} status - Task status ('done' | 'active' | 'crit' | other/null).
 * @returns {string} A CSS color (CSS variable or oklch literal).
 */
function barFill(status) {
  switch (status) {
    case 'done':      return 'var(--gm-muted)';
    case 'active':    return 'var(--gm-accent)';
    case 'crit':      return 'oklch(0.6 0.18 30)';
    default:          return 'var(--gm-node-fill)';
  }
}

/**
 * Pick a bar stroke: outlined for untyped tasks, none for status-colored ones.
 * @param {string|null} status - Task status.
 * @returns {string} A CSS stroke color or 'none'.
 */
function barStroke(status) {
  return status === null || status === undefined ? 'var(--gm-node-stroke)' : 'none';
}

/**
 * Render a GanttAST into the node layer: title, date axis with ticks, a "today"
 * marker, section header bands, and per-task bars (or diamonds for milestones).
 * Clears both layers first; the edge layer is unused for gantt charts.
 *
 * Horizontal scaling maps a timestamp `t` to x via
 * `LABEL_W + (t - minDate) / span * CHART_W`, where `span = maxDate - minDate`.
 *
 * @param {{title: string, sections: Array, minDate: number, maxDate: number}} ast - GanttAST from {@link parseGantt}.
 * @param {SVGElement} nodeLayer - Layer that receives the chart.
 * @param {SVGElement} edgeLayer - Edge layer (cleared but unused here).
 * @returns {void}
 */
export function renderGantt(ast, nodeLayer, edgeLayer) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();

  const { title, sections, minDate, maxDate } = ast;
  if (!sections.length) return;

  // Total time span (ms); floored at 1 to avoid divide-by-zero when all dates coincide.
  const span = Math.max(maxDate - minDate, 1);
  const totalW = LABEL_W + CHART_W;

  const g = svgEl('g');

  // Title
  if (title) {
    g.appendChild(svgEl('text', {
      class: 'gm-gantt-title',
      x: totalW / 2, y: 0,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    }, title));
  }

  // Date axis
  const axisY = AXIS_H - 8;
  g.appendChild(svgEl('line', {
    class: 'gm-gantt-axis-line',
    x1: LABEL_W, y1: axisY, x2: totalW, y2: axisY,
    stroke: 'var(--gm-panel-border)',
  }));

  // Aim for ~1 tick per 100px, clamped to 3..7 ticks.
  const tickCount = Math.min(7, Math.max(3, Math.floor(CHART_W / 100)));
  // Use full YYYY-MM-DD labels once the span exceeds ~2 years.
  const useLong   = span > 365 * 86400000 * 2;
  for (let ti = 0; ti <= tickCount; ti++) {
    const frac = ti / tickCount;
    const ms   = minDate + frac * span;
    const tx   = LABEL_W + frac * CHART_W;
    g.appendChild(svgEl('line', {
      class: 'gm-gantt-axis-line',
      x1: tx, y1: axisY - 4, x2: tx, y2: axisY + 4,
      stroke: 'var(--gm-panel-border)',
    }));
    g.appendChild(svgEl('text', {
      class: 'gm-gantt-axis-label',
      x: tx, y: axisY - 8,
      'text-anchor': 'middle',
      'dominant-baseline': 'auto',
    }, useLong ? fmtDateLong(ms) : fmtDate(ms)));
  }

  // Today line
  const now = Date.now();
  if (now >= minDate && now <= maxDate) {
    const todayX = LABEL_W + (now - minDate) / span * CHART_W;
    const totalH = AXIS_H + sections.reduce((h, s) => h + SEC_H + s.tasks.length * ROW_H, 0);
    g.appendChild(svgEl('line', {
      class: 'gm-gantt-today',
      x1: todayX, y1: axisY, x2: todayX, y2: totalH,
      stroke: 'var(--gm-accent)',
      'stroke-width': '1.5',
      'stroke-dasharray': '4,3',
      opacity: '0.7',
    }));
  }

  // Sections + tasks
  let rowY = AXIS_H;

  for (const sec of sections) {
    // Section header background
    const secBgW = totalW;
    g.appendChild(svgEl('rect', {
      class: 'gm-gantt-section',
      x: 0, y: rowY,
      width: secBgW, height: SEC_H,
      fill: 'var(--gm-header)',
      rx: 3,
    }));
    if (sec.name) {
      g.appendChild(svgEl('text', {
        class: 'gm-gantt-section',
        x: 10, y: rowY + SEC_H / 2,
        'dominant-baseline': 'middle',
        'font-weight': '600',
      }, sec.name));
    }
    rowY += SEC_H;

    for (const task of sec.tasks) {
      // Map task start/duration onto the chart's x scale; clamp bar width to >= 4px.
      const barX = LABEL_W + (task.start - minDate) / span * CHART_W;
      const rawW = (task.end - task.start) / span * CHART_W;
      const barW = Math.max(4, rawW);
      const barY = rowY + (ROW_H - BAR_H) / 2;

      // Row background (alternating subtly)
      g.appendChild(svgEl('rect', {
        class: 'gm-gantt-row-bg',
        x: 0, y: rowY,
        width: totalW, height: ROW_H,
        fill: 'none',
        stroke: 'var(--gm-panel-border)',
        'stroke-width': '0.5',
        opacity: '0.5',
      }));

      // Task label (left column)
      g.appendChild(svgEl('text', {
        class: 'gm-gantt-bar-label',
        x: LABEL_W - 8, y: rowY + ROW_H / 2,
        'text-anchor': 'end',
        'dominant-baseline': 'middle',
      }, task.label.length > 22 ? task.label.slice(0, 21) + '…' : task.label));

      if (task.status === 'milestone') {
        // Diamond shape
        const mx = barX + barW / 2, my = barY + BAR_H / 2, ms2 = BAR_H / 2;
        g.appendChild(svgEl('path', {
          class: 'gm-gantt-bar',
          d: `M${mx},${my-ms2} L${mx+ms2},${my} L${mx},${my+ms2} L${mx-ms2},${my} Z`,
          fill: 'var(--gm-accent)',
          stroke: 'none',
        }));
      } else {
        // Regular bar
        g.appendChild(svgEl('rect', {
          class: 'gm-gantt-bar',
          x: barX, y: barY,
          width: barW, height: BAR_H,
          fill: barFill(task.status),
          stroke: barStroke(task.status),
          'stroke-width': '1.5',
          rx: 4,
        }));

        // In-bar label for wider bars
        if (barW > 40) {
          g.appendChild(svgEl('text', {
            class: 'gm-gantt-bar-label',
            x: barX + barW / 2, y: barY + BAR_H / 2,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            fill: task.status === 'active' ? 'var(--gm-bg)' : 'var(--gm-text)',
          }, task.label.length > 16 ? task.label.slice(0, 15) + '…' : task.label));
        }
      }

      rowY += ROW_H;
    }
  }

  nodeLayer.appendChild(g);
}
