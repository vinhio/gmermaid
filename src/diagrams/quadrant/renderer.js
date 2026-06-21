/**
 * Renders a QuadrantAST into SVG: a 2x2 quadrant grid with plotted points.
 * @module diagrams/quadrant/renderer
 */

import { svgEl } from '../../core/renderer.js';

const SIZE = 320, PAD = 60;          // Plot area side length (px) and outer padding.
const Q_HUES = [155, 220, 330, 45];  // Background hues for quadrants Q1..Q4.

/**
 * Renders a QuadrantAST into the node layer. Clears both layers first.
 *
 * Draws four quadrant background tiles, the centre crosshair axes with their
 * low/high labels, then plots each point. Normalised point coordinates (0..1)
 * are scaled by {@link SIZE} and offset by {@link PAD}; the y axis is flipped
 * (`1 - y`) so that y=1 appears at the top of the chart.
 *
 * @param {ReturnType<import('./parser.js').parseQuadrant>} ast - Parsed quadrant AST.
 * @param {SVGGElement} nodeLayer - SVG group receiving the chart.
 * @param {SVGGElement} edgeLayer - SVG group for edges (cleared; unused here).
 * @returns {void}
 */
export function renderQuadrant(ast, nodeLayer, edgeLayer) {
  nodeLayer.replaceChildren(); edgeLayer.replaceChildren();
  const { title, xAxis, yAxis, quadrants, points } = ast;
  const g = svgEl('g');

  if (title) {
    g.appendChild(svgEl('text', {
      class: 'gm-quadrant-title',
      x: PAD + SIZE / 2, y: -24,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
    }, title));
  }

  // 4 quadrant backgrounds (Q1=top-right, Q2=top-left, Q3=btm-left, Q4=btm-right)
  const half = SIZE / 2;
  const qDefs = [
    [PAD + half, PAD],        // Q1
    [PAD,        PAD],        // Q2
    [PAD,        PAD + half], // Q3
    [PAD + half, PAD + half], // Q4
  ];
  qDefs.forEach(([qx, qy], i) => {
    g.appendChild(svgEl('rect', {
      x: qx, y: qy, width: half, height: half,
      fill: `oklch(0.25 0.05 ${Q_HUES[i]})`, opacity: '0.45',
    }));
    if (quadrants[i]) {
      g.appendChild(svgEl('text', {
        class: 'gm-quadrant-qlabel',
        x: qx + half / 2, y: qy + half / 2,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
      }, quadrants[i]));
    }
  });

  // Axes
  g.appendChild(svgEl('line', { x1: PAD, y1: PAD + half, x2: PAD + SIZE, y2: PAD + half, stroke: 'var(--gm-panel-border)', 'stroke-width': 2 }));
  g.appendChild(svgEl('line', { x1: PAD + half, y1: PAD, x2: PAD + half, y2: PAD + SIZE, stroke: 'var(--gm-panel-border)', 'stroke-width': 2 }));

  // Axis labels
  const al = 'gm-quadrant-axis-label';
  g.appendChild(svgEl('text', { class: al, x: PAD,        y: PAD + SIZE + 18, 'dominant-baseline': 'middle' }, xAxis.low));
  g.appendChild(svgEl('text', { class: al, x: PAD + SIZE, y: PAD + SIZE + 18, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, xAxis.high));
  g.appendChild(svgEl('text', { class: al, x: PAD - 8, y: PAD + SIZE, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, yAxis.low));
  g.appendChild(svgEl('text', { class: al, x: PAD - 8, y: PAD,        'text-anchor': 'end', 'dominant-baseline': 'middle' }, yAxis.high));

  // Points
  const HUES = [160, 220, 45, 330, 90, 270, 20, 185];
  points.forEach((pt, i) => {
    // Scale 0..1 coords to the plot box; flip y so higher y sits higher on screen.
    const px = PAD + pt.x * SIZE;
    const py = PAD + (1 - pt.y) * SIZE;
    g.appendChild(svgEl('circle', {
      class: 'gm-quadrant-point',
      cx: px, cy: py, r: 8,
      fill: `oklch(0.65 0.17 ${HUES[i % HUES.length]})`,
      stroke: 'var(--gm-bg)', 'stroke-width': 2,
    }));
    const label = pt.label.length > 18 ? pt.label.slice(0, 17) + '…' : pt.label;
    g.appendChild(svgEl('text', {
      class: 'gm-quadrant-point-label',
      x: px, y: py - 13,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
    }, label));
  });

  nodeLayer.appendChild(g);
}
