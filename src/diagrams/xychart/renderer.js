/**
 * @file Renders an XYChartAST into SVG.
 *
 * Draws a fixed-size plot area with y-axis gridlines/ticks, x-axis category
 * labels, and overlaid bar and line series. Values are mapped to pixels by
 * linear axis scaling against the parsed y-range.
 */
import { svgEl } from '../../core/renderer.js';

// Plot geometry (SVG user units): outer size and per-side padding; HUES cycles
// OKLCH hues across series.
const CHART_W = 560, CHART_H = 280, PAD_L = 60, PAD_B = 50, PAD_T = 40, PAD_R = 20;
const HUES = [220, 155, 45, 330, 90, 270];

/**
 * Render an XYChartAST into the given SVG layers.
 *
 * @param {{ title: string, xAxis: {labels: string[]}, yAxis: {label: string, min: number, max: number}, series: Array<{type:'bar'|'line', data:number[]}> }} ast - Parsed xychart AST.
 * @param {SVGElement} nodeLayer - Layer that receives the entire chart group.
 * @param {SVGElement} edgeLayer - Layer cleared but unused.
 * @returns {void}
 */
export function renderXYChart(ast, nodeLayer, edgeLayer) {
  nodeLayer.replaceChildren(); edgeLayer.replaceChildren();
  const { title, xAxis, yAxis, series } = ast;
  if (!series.length) return;

  // X labels: explicit categories, else interpolated ticks for a numeric x-axis,
  // else integer indices.
  const dataLen  = series[0]?.data.length ?? 0;
  const labels   = xAxis.labels.length ? xAxis.labels
    : (xAxis.numeric && dataLen
        ? Array.from({ length: dataLen }, (_, i) => fmtTick(xAxis.min + (xAxis.max - xAxis.min) * (dataLen > 1 ? i / (dataLen - 1) : 0)))
        : (series[0]?.data.map((_, i) => String(i)) ?? []));
  const n        = labels.length;
  const yMin     = yAxis.min ?? 0;
  const yMax     = yAxis.max ?? Math.max(...series.flatMap(s => s.data));
  const yRange   = yMax - yMin || 1; // guard against zero-span axes
  const barSeries = series.filter(s => s.type === 'bar');
  // Each category occupies a slot; bars take 60% of the slot split across bar series.
  const barW      = Math.max(8, (CHART_W - PAD_L - PAD_R) / n * 0.6 / Math.max(barSeries.length, 1));
  const slotW     = (CHART_W - PAD_L - PAD_R) / n;

  const g = svgEl('g');

  /**
   * Map a data value to a y pixel coordinate (axis grows upward).
   * @param {number} v - Data value.
   * @returns {number} Pixel y within the plot area.
   */
  function dataY(v) { return PAD_T + CHART_H - PAD_B - ((v - yMin) / yRange) * (CHART_H - PAD_T - PAD_B); }
  /**
   * Center x pixel coordinate of category slot `i`.
   * @param {number} i - Zero-based category index.
   * @returns {number} Pixel x at the slot center.
   */
  function slotX(i) { return PAD_L + i * slotW + slotW / 2; }

  // Title
  if (title) {
    g.appendChild(svgEl('text', {
      class: 'gm-xy-title',
      x: PAD_L + (CHART_W - PAD_L - PAD_R) / 2, y: PAD_T / 2,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
    }, title));
  }

  // Grid lines + Y axis ticks
  const ticks = 5;
  for (let t = 0; t <= ticks; t++) {
    const v  = yMin + (t / ticks) * yRange;
    const ty = dataY(v);
    g.appendChild(svgEl('line', { x1: PAD_L, y1: ty, x2: CHART_W - PAD_R, y2: ty, stroke: 'var(--gm-panel-border)', 'stroke-width': '0.5', 'stroke-dasharray': '4,4' }));
    g.appendChild(svgEl('text', {
      class: 'gm-xy-tick', x: PAD_L - 6, y: ty,
      'text-anchor': 'end', 'dominant-baseline': 'middle',
    }, fmtTick(v)));
  }

  // X axis labels
  labels.forEach((lbl, i) => {
    g.appendChild(svgEl('text', {
      class: 'gm-xy-tick',
      x: slotX(i), y: CHART_H - PAD_B + 14,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
    }, lbl.length > 6 ? lbl.slice(0,5)+'…' : lbl));
  });

  // Axes
  g.appendChild(svgEl('line', { x1: PAD_L, y1: PAD_T, x2: PAD_L, y2: CHART_H - PAD_B, stroke: 'var(--gm-muted)', 'stroke-width': '1.5' }));
  g.appendChild(svgEl('line', { x1: PAD_L, y1: CHART_H - PAD_B, x2: CHART_W - PAD_R, y2: CHART_H - PAD_B, stroke: 'var(--gm-muted)', 'stroke-width': '1.5' }));

  // Y axis label
  if (yAxis.label) {
    const yl = svgEl('text', { class: 'gm-xy-axis-label', x: -(CHART_H / 2), y: 14, 'text-anchor': 'middle', 'dominant-baseline': 'middle', transform: 'rotate(-90)' }, yAxis.label);
    g.appendChild(yl);
  }

  // Bars grow from the zero line (clamped into range), so negative values draw
  // downward; series are offset side by side within each category slot.
  const baseY = dataY(Math.max(yMin, Math.min(yMax, 0)));
  barSeries.forEach((s, si) => {
    const color = `oklch(0.55 0.17 ${HUES[si % HUES.length]})`;
    const totalBarW = barW * barSeries.length;
    s.data.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      const bx = slotX(i) - totalBarW / 2 + si * barW;
      const vy = dataY(v);
      const by = Math.min(vy, baseY), bh = Math.abs(vy - baseY);
      if (bh < 0.5) return;
      g.appendChild(svgEl('rect', { class: 'gm-xy-bar', x: bx, y: by, width: barW - 2, height: bh, fill: color, rx: 2 }));
    });
  });

  // Lines: a polyline through each value plus a dot marker at every point.
  // Hue index continues past the bar series so line colors don't collide.
  series.filter(s => s.type === 'line').forEach((s, si) => {
    const color = `oklch(0.7 0.18 ${HUES[(si + barSeries.length) % HUES.length]})`;
    const pts = s.data.map((v, i) => `${slotX(i)},${dataY(v)}`).join(' ');
    g.appendChild(svgEl('polyline', { class: 'gm-xy-line', points: pts, stroke: color, fill: 'none', 'stroke-width': '2.5', 'stroke-linejoin': 'round' }));
    s.data.forEach((v, i) => {
      g.appendChild(svgEl('circle', { class: 'gm-xy-dot', cx: slotX(i), cy: dataY(v), r: 4, fill: color, stroke: 'var(--gm-bg)', 'stroke-width': 2 }));
    });
  });

  nodeLayer.appendChild(g);
}

/**
 * Format an axis tick value: integers as-is, otherwise one decimal place.
 * @param {number} v - The tick value.
 * @returns {string} The formatted label.
 */
function fmtTick(v) {
  return Number.isInteger(v) ? String(v) : (Math.abs(v) < 10 ? v.toFixed(1) : String(Math.round(v)));
}
