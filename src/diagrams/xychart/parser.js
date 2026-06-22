/**
 * @file Parses Mermaid `xychart-beta` syntax into an XYChartAST.
 *
 * Recognizes the chart title, orientation, x-axis (categorical or numeric
 * range, with optional title), y-axis (label and optional numeric range, else
 * auto-ranged from the data), and one or more `bar`/`line` data series.
 * Parsing is line-oriented and never touches the DOM.
 */

/** Numeric token (signed, optional decimals). */
const NUM = '-?\\d+(?:\\.\\d+)?';

/**
 * Parse Mermaid xychart-beta text into an XYChartAST.
 *
 * @param {string} text - Raw xychart-beta source.
 * @returns {{
 *   type: 'xychart',
 *   title: string,
 *   horizontal: boolean,
 *   xAxis: { labels: string[], title?: string, numeric?: boolean, min?: number, max?: number },
 *   yAxis: { label: string, min: number, max: number },
 *   series: Array<{ type: 'bar'|'line', data: number[] }>
 * }} AST describing the chart. `horizontal` is true for the `horizontal` orientation.
 */
export function parseXYChart(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  let title = '';
  let horizontal = false;
  const xAxis = { labels: [] };
  const yAxis = { label: '' };
  let yRangeSet = false;
  const series = [];

  for (const line of lines) {
    if (/^xychart(?:-beta)?\b/i.test(line)) { horizontal = /\bhorizontal\b/i.test(line); continue; }
    if (/^title\s+/i.test(line)) { title = unquote(line.replace(/^title\s+/i, '').trim()); continue; }

    // x-axis: `[cat,...]`, `title [cat,...]`, `title min --> max`, or just `title`.
    const xm = line.match(/^x-axis\s+(.+)$/i);
    if (xm) { parseXAxis(xm[1].trim(), xAxis); continue; }

    // y-axis: `"Label" min --> max`, `min --> max`, or just `"Label"` (auto-range).
    const ym = line.match(new RegExp(`^y-axis\\s+(.*?)\\s*(${NUM})\\s*-->\\s*(${NUM})\\s*$`, 'i'));
    if (ym) { yAxis.label = unquote(ym[1].trim()); yAxis.min = +ym[2]; yAxis.max = +ym[3]; yRangeSet = true; continue; }
    const ym2 = line.match(/^y-axis\s+(.+)$/i);
    if (ym2) { yAxis.label = unquote(ym2[1].trim()); continue; }

    // Data series: bar [..] / line [..] (signed decimals allowed).
    const dm = line.match(/^(bar|line)\s+\[(.+)\]\s*$/i);
    if (dm) { series.push({ type: dm[1].toLowerCase(), data: dm[2].split(',').map(s => Number(s.trim())) }); continue; }
  }

  // Auto-range the y-axis from the data when no explicit range was given.
  if (!yRangeSet) {
    const all = series.flatMap(s => s.data).filter(Number.isFinite);
    if (all.length) {
      const lo = Math.min(0, ...all);          // bars baseline at zero (or below for negatives)
      const hi = Math.max(0, ...all);
      const pad = (hi - lo) * 0.08 || 1;
      yAxis.min = lo;
      yAxis.max = hi + pad;
    } else {
      yAxis.min = 0; yAxis.max = 100;
    }
  }

  return { type: 'xychart', title, horizontal, xAxis, yAxis, series };
}

/**
 * Parse the body of an `x-axis` line into the axis object.
 * @param {string} raw - Text after `x-axis`.
 * @param {{labels: string[], title?: string, numeric?: boolean, min?: number, max?: number}} xAxis - Axis to mutate.
 * @returns {void}
 */
function parseXAxis(raw, xAxis) {
  const bracket = raw.match(/^(.*?)\s*\[(.+)\]\s*$/);
  if (bracket) {
    if (bracket[1].trim()) xAxis.title = unquote(bracket[1].trim());
    xAxis.labels = splitFields(bracket[2]);
    return;
  }
  const rng = raw.match(new RegExp(`^(.*?)\\s*(${NUM})\\s*-->\\s*(${NUM})\\s*$`));
  if (rng) {
    if (rng[1].trim()) xAxis.title = unquote(rng[1].trim());
    xAxis.numeric = true; xAxis.min = +rng[2]; xAxis.max = +rng[3];
    return;
  }
  xAxis.title = unquote(raw);
}

/**
 * Split a comma-separated list, respecting double quotes (so a quoted category
 * may contain a comma), and strip surrounding quotes from each field.
 * @param {string} str - The list body (without the brackets).
 * @returns {string[]} The trimmed, unquoted fields.
 */
function splitFields(str) {
  const out = [];
  let cur = '', inQ = false;
  for (const ch of str) {
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out.map(s => unquote(s)).filter(s => s.length);
}

/**
 * Strip a single pair of surrounding double/single quotes from a string.
 * @param {string} s - The string.
 * @returns {string} The unquoted string.
 */
function unquote(s) {
  s = s.trim();
  if (s.length >= 2 && /^["']/.test(s) && s.endsWith(s[0])) s = s.slice(1, -1);
  return s;
}
