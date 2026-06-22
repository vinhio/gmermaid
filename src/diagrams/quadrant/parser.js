/**
 * Parses Mermaid `quadrantChart` syntax into a QuadrantAST.
 * @module diagrams/quadrant/parser
 *
 * Aims to cover the documented Mermaid quadrant syntax:
 * https://mermaid.js.org/syntax/quadrantChart.html
 */

/**
 * Parses Mermaid quadrant-chart text into an AST. Does not touch the DOM.
 *
 * Recognises `title`, two-label (`x-axis low --> high`) and single-label
 * (`x-axis label`) axes, `quadrant-N <label>` (N 1..4), point rows
 * `Label[:::class]: [x, y] [styles]`, and `classDef name <styles>`.
 *
 * @param {string} text - Raw Mermaid quadrantChart source.
 * @returns {{
 *   type: 'quadrant',
 *   title: string,
 *   xAxis: { low: string, high: string, single: boolean },
 *   yAxis: { low: string, high: string, single: boolean },
 *   quadrants: [string, string, string, string],
 *   points: Array<{ label: string, x: number, y: number, style: object }>
 * }} QuadrantAST. `quadrants` is indexed 0..3 for quadrant-1..4; point x/y are 0..1.
 */
export function parseQuadrant(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  let title = '';
  const xAxis = { low: 'Low', high: 'High', single: false };
  const yAxis = { low: 'Low', high: 'High', single: false };
  const quadrants = ['', '', '', ''];
  const points = [];
  const classDefs = {};

  for (const line of lines) {
    if (/^quadrantChart\b/i.test(line)) continue;
    if (/^title\s+/i.test(line)) { title = line.replace(/^title\s+/i, '').trim(); continue; }

    if (parseAxis(line, /^x-axis\s+/i, xAxis)) continue;
    if (parseAxis(line, /^y-axis\s+/i, yAxis)) continue;

    // quadrant-1..4 -> 0-based index into the quadrants array.
    const qm = line.match(/^quadrant-([1-4])\s+(.+)$/i);
    if (qm) { quadrants[+qm[1] - 1] = qm[2].trim(); continue; }

    // classDef name <style props>
    const cdm = line.match(/^classDef\s+(\w+)\s+(.+)$/i);
    if (cdm) { classDefs[cdm[1]] = parsePointStyle(cdm[2]); continue; }

    // Point: "Label[:::class]: [x, y] [radius: .., color: .., ...]"
    const pm = line.match(/^(.+?)(?::::(\w+))?\s*:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]\s*(.*)$/);
    if (pm) {
      points.push({
        label: pm[1].trim(),
        x: clamp01(parseFloat(pm[3])),
        y: clamp01(parseFloat(pm[4])),
        className: pm[2] || null,
        inlineStyle: parsePointStyle(pm[5]),
      });
    }
  }

  // Resolve each point's style: classDef base overridden by inline styling.
  for (const p of points) {
    p.style = { ...(p.className && classDefs[p.className] ? classDefs[p.className] : {}), ...p.inlineStyle };
    delete p.className;
    delete p.inlineStyle;
  }

  return { type: 'quadrant', title, xAxis, yAxis, quadrants, points };
}

/**
 * Parse an axis line into the given axis object: two-label (`low --> high`) or
 * single-label (centered) form.
 * @param {string} line - The source line.
 * @param {RegExp} prefix - Axis keyword prefix (e.g. /^x-axis\s+/i).
 * @param {{low: string, high: string, single: boolean}} axis - Axis object to mutate.
 * @returns {boolean} True if the line was an axis for this prefix.
 */
function parseAxis(line, prefix, axis) {
  if (!prefix.test(line)) return false;
  const rest = line.replace(prefix, '').trim();
  const m = rest.match(/^(.+?)\s+-->\s+(.+)$/);
  if (m) { axis.low = m[1].trim(); axis.high = m[2].trim(); axis.single = false; }
  else { axis.low = rest; axis.high = ''; axis.single = true; }
  return true;
}

/**
 * Parse a comma-separated point style string into a normalized style object.
 * Recognized keys: `radius`, `color`, `stroke-color`, `stroke-width`.
 * @param {string} str - e.g. "radius: 12, color: #ff0000, stroke-width: 2px".
 * @returns {{radius?: number, color?: string, strokeColor?: string, strokeWidth?: string}} The style.
 */
function parsePointStyle(str) {
  const style = {};
  for (const part of (str || '').split(',')) {
    const m = part.match(/^\s*([\w-]+)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'radius') style.radius = parseFloat(v);
    else if (k === 'color') style.color = v;
    else if (k === 'stroke-color') style.strokeColor = v;
    else if (k === 'stroke-width') style.strokeWidth = v;
  }
  return style;
}

/**
 * Clamp a value into the valid 0..1 coordinate range.
 * @param {number} v - The coordinate.
 * @returns {number} The clamped value (0 when NaN).
 */
function clamp01(v) {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
