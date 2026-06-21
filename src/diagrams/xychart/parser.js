/**
 * @file Parses Mermaid `xychart-beta` syntax into an XYChartAST.
 *
 * Recognizes the chart title, orientation, x-axis categories or title,
 * y-axis label and numeric range, and one or more `bar`/`line` data series.
 * Parsing is line-oriented and never touches the DOM.
 */

/**
 * Parse Mermaid xychart-beta text into an XYChartAST.
 *
 * @param {string} text - Raw xychart-beta source.
 * @returns {{
 *   type: 'xychart',
 *   title: string,
 *   horizontal: boolean,
 *   xAxis: { labels: string[], title?: string },
 *   yAxis: { label: string, min: number, max: number },
 *   series: Array<{ type: 'bar'|'line', data: number[] }>
 * }} AST describing the chart. `horizontal` is true for `lr` orientation.
 */
export function parseXYChart(text) {
  // Strip blank lines and %% comments.
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  let title = '';
  let horizontal = false;
  const xAxis = { labels: [] };
  const yAxis = { label: '', min: 0, max: 100 };
  const series = [];

  for (const line of lines) {
    if (/^xychart-beta\b/i.test(line)) {
      horizontal = /\blr\b/i.test(line);
      continue;
    }
    if (/^title\s+/i.test(line)) { title = line.replace(/^title\s+/i, '').replace(/^["']|["']$/g, '').trim(); continue; }

    // x-axis [A, B, C]  → category labels;  x-axis "Title"  → axis title only.
    const xm = line.match(/^x-axis\s+(.+)$/i);
    if (xm) {
      const raw = xm[1].trim();
      const lm = raw.match(/^\[(.+)\]$/);
      if (lm) xAxis.labels = lm[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      else xAxis.title = raw.replace(/^["']|["']$/g, '');
      continue;
    }

    // y-axis "Label" min --> max  (range optional; defaults stay 0..100).
    const ym = line.match(/^y-axis\s+(.+?)\s+(\d+(?:\.\d+)?)\s*-->\s*(\d+(?:\.\d+)?)/i);
    if (ym) { yAxis.label = ym[1].replace(/^["']|["']$/g, '').trim(); yAxis.min = +ym[2]; yAxis.max = +ym[3]; continue; }
    const ym2 = line.match(/^y-axis\s+(.+)$/i);
    if (ym2) { yAxis.label = ym2[1].replace(/^["']|["']$/g, '').trim(); continue; }

    // Data series: bar [..] / line [..], comma-separated numbers.
    const barm = line.match(/^bar\s+\[(.+)\]$/i);
    if (barm) { series.push({ type: 'bar', data: barm[1].split(',').map(Number) }); continue; }
    const linem = line.match(/^line\s+\[(.+)\]$/i);
    if (linem) { series.push({ type: 'line', data: linem[1].split(',').map(Number) }); continue; }
  }

  return { type: 'xychart', title, horizontal, xAxis, yAxis, series };
}
