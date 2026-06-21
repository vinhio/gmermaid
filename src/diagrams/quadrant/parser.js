/**
 * Parses Mermaid `quadrantChart` syntax into a QuadrantAST.
 * @module diagrams/quadrant/parser
 */

/**
 * Parses Mermaid quadrant-chart text into an AST. Does not touch the DOM.
 *
 * Recognises `title`, `x-axis low --> high`, `y-axis low --> high`,
 * `quadrant-N <label>` (N is 1..4), and point rows `Label: [x, y]` where x and
 * y are normalised coordinates in the 0..1 range.
 *
 * @param {string} text - Raw Mermaid quadrantChart source.
 * @returns {{
 *   type: 'quadrant',
 *   title: string,
 *   xAxis: { low: string, high: string },
 *   yAxis: { low: string, high: string },
 *   quadrants: [string, string, string, string],
 *   points: Array<{ label: string, x: number, y: number }>
 * }} QuadrantAST. `quadrants` is indexed 0..3 for quadrant-1..4; point x/y are 0..1.
 */
export function parseQuadrant(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  let title = '';
  const xAxis = { low: 'Low', high: 'High' };
  const yAxis = { low: 'Low', high: 'High' };
  const quadrants = ['', '', '', ''];
  const points = [];

  for (const line of lines) {
    if (/^quadrantChart\b/i.test(line)) continue;
    if (/^title\s+/i.test(line)) { title = line.replace(/^title\s+/i, '').trim(); continue; }
    const xm = line.match(/^x-axis\s+(.+?)\s+-->\s+(.+)$/i);
    if (xm) { xAxis.low = xm[1].trim(); xAxis.high = xm[2].trim(); continue; }
    const ym = line.match(/^y-axis\s+(.+?)\s+-->\s+(.+)$/i);
    if (ym) { yAxis.low = ym[1].trim(); yAxis.high = ym[2].trim(); continue; }
    // quadrant-1..4 -> 0-based index into the quadrants array.
    const qm = line.match(/^quadrant-([1-4])\s+(.+)$/i);
    if (qm) { quadrants[+qm[1] - 1] = qm[2].trim(); continue; }
    // Point: "Label: [x, y]" with x/y as 0..1 normalised coordinates.
    const pm = line.match(/^(.+?):\s*\[([0-9.]+),\s*([0-9.]+)\]$/);
    if (pm) points.push({ label: pm[1].trim(), x: +pm[2], y: +pm[3] });
  }

  return { type: 'quadrant', title, xAxis, yAxis, quadrants, points };
}
