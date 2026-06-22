/**
 * Renders a TimelineAST into SVG (horizontal axis, period dots, event labels, section bands).
 * @module diagrams/timeline/renderer
 */
import { svgEl } from '../../core/renderer.js';

const ITEM_W  = 140; // horizontal slot width per timeline item
const AXIS_Y  = 80;   // axis sits at y=80 inside the g; viewport offset handles padding
const PAD_X   = 40;  // left/right padding around the content
const HUES    = [220, 160, 45, 330, 90, 270, 20, 185]; // hues cycled per item and per section

/**
 * Render a TimelineAST into the node layer: title, section background bands, a
 * horizontal axis with an arrow cap, and one dot + period + events per item.
 * Clears both layers first; the edge layer is unused for timelines.
 *
 * Item `i` occupies the slot `[PAD_X + i*ITEM_W, PAD_X + (i+1)*ITEM_W]` and is
 * drawn centered within it.
 *
 * @param {{title: string, items: Array<{period: string, section: string, events: string[]}>}} ast - TimelineAST from {@link parseTimeline}.
 * @param {SVGElement} nodeLayer - Layer that receives the timeline.
 * @param {SVGElement} edgeLayer - Edge layer (cleared but unused here).
 * @returns {void}
 */
export function renderTimeline(ast, nodeLayer, edgeLayer) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();

  const { title, items } = ast;
  if (!items.length) return;

  const contentW = items.length * ITEM_W;
  const totalW   = PAD_X * 2 + contentW;
  const g = svgEl('g');

  // Title (above the content)
  if (title) {
    g.appendChild(svgEl('text', {
      class: 'gm-timeline-title',
      x: totalW / 2, y: -20,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    }, title));
  }

  // ── Section bands (drawn first so they sit behind everything) ──
  let sectionStart = 0;
  let currentSection = items[0]?.section ?? '';
  let si = 0;

  /**
   * Draw the background band (and label) for the section spanning
   * items `[sectionStart, endIdx)`, inserted behind existing content.
   * @param {number} endIdx - Exclusive end item index of the current section run.
   * @returns {void}
   */
  const flushSection = (endIdx) => {
    if (endIdx <= sectionStart) return;
    // bx/bw aligned with item slots: each item occupies [PAD_X + i*ITEM_W .. PAD_X + (i+1)*ITEM_W]
    const bx = PAD_X + sectionStart * ITEM_W;
    const bw = (endIdx - sectionStart) * ITEM_W;
    g.insertBefore(svgEl('rect', {
      x: bx, y: AXIS_Y - 52,
      width: bw, height: 160,
      fill: `oklch(0.25 0.05 ${HUES[si % HUES.length]})`,
      rx: 4,
      opacity: '0.45',
    }), g.firstChild);
    if (currentSection) {
      g.appendChild(svgEl('text', {
        class: 'gm-timeline-section',
        x: bx + bw / 2, y: AXIS_Y - 40,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      }, currentSection));
    }
  };

  // ── Axis line ──
  g.appendChild(svgEl('line', {
    class: 'gm-timeline-axis',
    x1: PAD_X, y1: AXIS_Y,
    x2: PAD_X + contentW, y2: AXIS_Y,
    stroke: 'var(--gm-panel-border)',
    'stroke-width': '2',
  }));
  // Arrow caps
  g.appendChild(svgEl('polygon', {
    points: `${PAD_X + contentW},${AXIS_Y - 4} ${PAD_X + contentW + 10},${AXIS_Y} ${PAD_X + contentW},${AXIS_Y + 4}`,
    fill: 'var(--gm-panel-border)',
  }));

  // ── Items ──
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.section !== currentSection) {
      flushSection(i);
      currentSection = item.section;
      sectionStart = i;
      si++;
    }

    // Each item is centered in its slot: slot i → x range [PAD_X + i*ITEM_W, PAD_X + (i+1)*ITEM_W]
    const cx    = PAD_X + i * ITEM_W + ITEM_W / 2;
    const color = `oklch(0.65 0.17 ${HUES[i % HUES.length]})`;

    // Dot on axis
    g.appendChild(svgEl('circle', {
      class: 'gm-timeline-dot',
      cx, cy: AXIS_Y, r: 7,
      fill: color,
      stroke: 'var(--gm-bg)',
      'stroke-width': '2',
    }));

    // Vertical connector line
    g.appendChild(svgEl('line', {
      x1: cx, y1: AXIS_Y - 7,
      x2: cx, y2: AXIS_Y - 24,
      stroke: color,
      'stroke-width': '1.5',
    }));

    // Period label (above axis)
    g.appendChild(svgEl('text', {
      class: 'gm-timeline-period',
      x: cx, y: AXIS_Y - 30,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: color,
    }, item.period));

    // Events (below axis); each event may wrap on `<br>` into several lines.
    let ey = AXIS_Y + 22;
    for (const ev of item.events) {
      for (const raw of ev.split(/<br\s*\/?>/i)) {
        const ln    = raw.trim();
        const label = ln.length > 18 ? ln.slice(0, 17) + '…' : ln;
        g.appendChild(svgEl('text', {
          class: 'gm-timeline-event',
          x: cx, y: ey,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
        }, label));
        ey += 17;
      }
      ey += 4; // small gap between distinct events
    }
  }
  flushSection(items.length);

  nodeLayer.appendChild(g);
}
