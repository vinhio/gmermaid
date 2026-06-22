/**
 * @file Parses Mermaid `sankey-beta` syntax into a SankeyAST.
 *
 * The body is RFC 4180 CSV of `source,target,value` rows describing weighted
 * flows between nodes. Fields may be double-quoted (to contain commas), and a
 * literal double quote inside a quoted field is escaped by doubling it (`""`).
 * Parsing never touches the DOM.
 */

/**
 * Tokenize CSV text into rows of fields per RFC 4180: double-quoted fields may
 * contain commas and newlines, and `""` inside a quoted field is a literal `"`.
 * @param {string} text - Raw CSV text.
 * @returns {string[][]} Rows of field strings (quotes resolved, not trimmed).
 */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuote = false;
  const endField = () => { row.push(field); field = ''; };
  const endRow   = () => { endField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }  // escaped quote
        else inQuote = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuote = true;
    else if (ch === ',') endField();
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else field += ch;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}

/**
 * Parse Mermaid sankey-beta text into a SankeyAST.
 *
 * @param {string} text - Raw sankey-beta source (header line plus CSV rows).
 * @returns {{
 *   type: 'sankey',
 *   nodes: Array<{ id: string, side: 'left'|'right' }>,
 *   links: Array<{ source: string, target: string, value: number }>
 * }} AST where `links` are the weighted flows and `nodes` is the unique node
 *   list ordered sources-first, with `side` hinting initial horizontal placement.
 */
export function parseSankey(text) {
  const links = [];

  for (const row of parseCSV(text)) {
    const first = (row[0] ?? '').trim();
    // Skip the header, comments, and blank/configuration rows (no real triple).
    if (/^sankey-beta\b/i.test(first) || first.startsWith('%%')) continue;
    if (row.length < 3) continue;

    const source = first;
    const target = (row[1] ?? '').trim();
    const value  = parseFloat(row[2]);
    if (source && target && value > 0) links.push({ source, target, value });
  }

  // Build unique ordered node list: sources first, then pure targets.
  // A node appearing as both source and target is kept on the left side.
  const sourceSet = new Set(links.map(l => l.source));
  const targetSet = new Set(links.map(l => l.target));
  const nodes = [
    ...[...sourceSet].map(id => ({ id, side: 'left' })),
    ...[...targetSet].filter(id => !sourceSet.has(id)).map(id => ({ id, side: 'right' })),
  ];

  return { type: 'sankey', nodes, links };
}
