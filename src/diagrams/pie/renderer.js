/**
 * Renders a PieAST into SVG.
 * @module diagrams/pie/renderer
 */
import { svgEl } from '../../core/renderer.js';

/** Hue values (oklch) cycled across slices and legend swatches. */
const HUES   = [160, 220, 45, 330, 90, 270, 20, 185];
/** Pie radius in SVG units. */
const RADIUS = 150;

/**
 * Build an SVG path string for a single pie slice (wedge from the center).
 * @param {number} cx - Center x.
 * @param {number} cy - Center y.
 * @param {number} r - Radius.
 * @param {number} sa - Start angle in radians.
 * @param {number} ea - End angle in radians.
 * @returns {string} An SVG path `d` describing the wedge.
 */
function pieSlicePath(cx, cy, r, sa, ea) {
  // Arc endpoints on the circle for the start/end angles.
  const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
  const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
  // large-arc-flag: 1 when the slice spans more than half the circle (> π).
  const large = (ea - sa > Math.PI) ? 1 : 0;
  return `M${cx},${cy} L${x1},${y1} A${r},${r},0,${large},1,${x2},${y2} Z`;
}

/**
 * Render a PieAST into the node layer as wedges, in-slice percentage labels,
 * and a legend. Clears both layers first; the edge layer is unused for pies.
 * @param {{title: string, slices: Array<{label: string, value: number}>}} ast - PieAST from {@link parsePie}.
 * @param {SVGElement} nodeLayer - Layer that receives the pie geometry.
 * @param {SVGElement} edgeLayer - Edge layer (cleared but unused here).
 * @returns {void}
 */
export function renderPie(ast, nodeLayer, edgeLayer) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();

  const { title, slices } = ast;
  if (!slices.length) return;

  const total = slices.reduce((s, p) => s + p.value, 0);
  const cx = 0, cy = 0;
  const R  = RADIUS;

  const g = svgEl('g');

  // Title
  if (title) {
    g.appendChild(svgEl('text', {
      class: 'gm-pie-title',
      x: cx, y: cy - R - 28,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    }, title));
  }

  // Slices — start at -90° (12 o'clock) and sweep clockwise.
  let angle = -Math.PI / 2;
  slices.forEach((slice, i) => {
    // Each slice's angular sweep is proportional to its share of the total.
    const sweep  = (slice.value / total) * 2 * Math.PI;
    const endAng = angle + sweep;
    const color  = `oklch(0.65 0.17 ${HUES[i % HUES.length]})`;

    const path = svgEl('path', {
      class: 'gm-pie-slice',
      d: pieSlicePath(cx, cy, R, angle, endAng),
      fill: color,
      stroke: 'var(--gm-bg)',
      'stroke-width': '2',
    });
    g.appendChild(path);

    // Percentage label inside slice (skip tiny slices < ~17°)
    if (sweep > 0.3) {
      // Place the label at the slice's mid-angle, 65% of the way out from center.
      const midA  = angle + sweep / 2;
      const lr    = R * 0.65;
      const pct   = Math.round((slice.value / total) * 100) + '%';
      g.appendChild(svgEl('text', {
        class: 'gm-pie-pct',
        x: cx + lr * Math.cos(midA),
        y: cy + lr * Math.sin(midA),
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      }, pct));
    }

    angle = endAng;
  });

  // Legend
  const legX = cx + R + 24;
  const legStartY = cy - R;
  slices.forEach((slice, i) => {
    const color = `oklch(0.65 0.17 ${HUES[i % HUES.length]})`;
    const ry = legStartY + i * 22;

    g.appendChild(svgEl('rect', {
      x: legX, y: ry - 6,
      width: 12, height: 12,
      fill: color,
      rx: 2,
    }));
    g.appendChild(svgEl('text', {
      class: 'gm-pie-legend-text',
      x: legX + 16, y: ry + 1,
      'dominant-baseline': 'middle',
    }, `${slice.label} (${slice.value})`));
  });

  nodeLayer.appendChild(g);
}
