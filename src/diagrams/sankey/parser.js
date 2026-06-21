/**
 * @file Parses Mermaid `sankey-beta` syntax into a SankeyAST.
 *
 * The body is a CSV of `source,target,value` rows describing weighted flows
 * between nodes. Parsing never touches the DOM; the resulting AST is consumed
 * by the sankey renderer.
 */

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
  // Strip blank lines and %% comments, normalize whitespace per line.
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  const links = [];

  for (const line of lines) {
    if (/^sankey-beta\b/i.test(line)) continue;
    // CSV: source,target,value (quotes around source/target are optional)
    const parts = line.split(',');
    if (parts.length < 3) continue;
    const source = parts[0].replace(/^["']|["']$/g, '').trim();
    const target = parts[1].replace(/^["']|["']$/g, '').trim();
    const value  = parseFloat(parts[2]) || 0;
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
