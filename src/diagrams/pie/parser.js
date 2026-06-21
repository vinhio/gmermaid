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
 * @returns {{type: 'pie', title: string, slices: Array<{label: string, value: number}>}}
 *   PieAST: `title` is the chart heading, `slices` are the label/value pairs in source order.
 */
export function parsePie(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));

  let title  = '';
  const slices = [];

  for (const line of lines) {
    if (/^pie\b/i.test(line)) {
      const m = line.match(/^pie\s+(?:showData\s+)?title\s+(.+)/i);
      if (m) title = m[1].trim();
      continue;
    }
    if (/^title\s/i.test(line)) {
      title = line.replace(/^title\s+/i, '').trim();
      continue;
    }
    // Slice line: "Label" : value  (value may be integer or decimal)
    const m = line.match(/^"([^"]+)"\s*:\s*(\d+(?:\.\d+)?)/);
    if (m) slices.push({ label: m[1], value: parseFloat(m[2]) });
  }

  return { type: 'pie', title, slices };
}
