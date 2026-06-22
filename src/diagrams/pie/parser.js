/**
 * Parses Mermaid pie syntax into a PieAST.
 * @module diagrams/pie/parser
 */

/**
 * Parse Mermaid pie chart text into a PieAST.
 *
 * Recognized lines:
 *   - `pie [showData] title <text>` or a standalone `title <text>` line.
 *   - `"<label>" : <number>` slice definitions.
 *
 * @param {string} text - Raw Mermaid pie source.
 * @returns {{type: 'pie', title: string, showData: boolean, slices: Array<{label: string, value: number}>}}
 *   PieAST: `title` is the chart heading, `showData` requests actual values in
 *   the legend, `slices` are the label/value pairs in source order.
 */
export function parsePie(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));

  let title    = '';
  let showData = false;
  const slices = [];

  for (const line of lines) {
    if (/^pie\b/i.test(line)) {
      // `showData` and `title <text>` may appear on the header line in any order.
      if (/\bshowData\b/i.test(line)) showData = true;
      const m = line.match(/\btitle\s+(.+)/i);
      if (m) title = m[1].replace(/\s+showData\s*$/i, '').trim();
      continue;
    }
    if (/^showData\b/i.test(line)) { showData = true; continue; }
    if (/^title\s/i.test(line)) {
      title = line.replace(/^title\s+/i, '').trim();
      continue;
    }
    // Slice line: "Label" : value  (positive integer or decimal).
    const m = line.match(/^"([^"]+)"\s*:\s*(\d+(?:\.\d+)?)/);
    if (m) {
      const value = parseFloat(m[2]);
      if (value > 0) slices.push({ label: m[1], value }); // values must be positive
    }
  }

  return { type: 'pie', title, showData, slices };
}
