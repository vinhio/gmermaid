/**
 * Parses Mermaid C4 syntax (C4Context/Container/Component/Dynamic) into a C4AST.
 * @module diagrams/c4/parser
 */

/**
 * Splits the comma-separated argument list of a C4 call (e.g. the inside of
 * `Person(id, "label", "desc")`) into trimmed argument strings.
 *
 * Commas and parentheses inside double quotes are treated as literal text, and
 * nesting depth is tracked so commas within parenthesised groups are not split.
 *
 * @param {string} argsStr - Raw argument text between the outer parentheses.
 * @returns {string[]} Ordered list of argument values with surrounding quotes removed.
 */
function parseCallArgs(argsStr) {
  const args = [];
  let current = '';
  let inQuote = false;
  let depth = 0;
  for (const ch of argsStr) {
    if (ch === '"' && depth === 0) { inQuote = !inQuote; continue; }
    if (!inQuote && ch === '(') { depth++; current += ch; continue; }
    if (!inQuote && ch === ')') { depth--; if (depth >= 0) { current += ch; } continue; }
    if (!inQuote && ch === ',' && depth === 0) { args.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

/**
 * Parses Mermaid C4 diagram text into an AST. Does not touch the DOM.
 *
 * Element calls (`Person`, `System`, `Container`, `Component` and their
 * `_Ext`/`Db` variants) and relationship calls (`Rel`, `BiRel`) are recognised;
 * stray `{`/`}` boundary braces are stripped (boundary nesting itself is flattened).
 *
 * @param {string} text - Raw Mermaid C4 source.
 * @returns {{
 *   type: 'c4',
 *   subtype: 'context'|'container'|'component'|'dynamic',
 *   title: string,
 *   elements: Array<{ kind: string, ext: boolean, db?: boolean, id: string, label: string, tech?: string, desc: string }>,
 *   rels: Array<{ from: string, to: string, label: string, bidir: boolean }>
 * }} C4AST. `ext` marks external elements; `db` marks datastore variants.
 */
export function parseC4(text) {
  // Drop comments and lone boundary braces so boundary blocks are flattened.
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%') && l !== '{' && l !== '}');
  let subtype = 'context';
  let title = '';
  const elements = [];
  const rels = [];

  for (const line of lines) {
    if (/^C4Context\b/i.test(line))   { subtype = 'context'; continue; }
    if (/^C4Container\b/i.test(line)) { subtype = 'container'; continue; }
    if (/^C4Component\b/i.test(line)) { subtype = 'component'; continue; }
    if (/^C4Dynamic\b/i.test(line))   { subtype = 'dynamic'; continue; }
    if (/^title\s+/i.test(line))      { title = line.replace(/^title\s+/i, '').trim(); continue; }

    // Match a call form `Kind(args...)`; ku normalises the kind for prefix tests.
    const m = line.match(/^(\w+)\((.*)\)\s*$/);
    if (!m) continue;
    const [, kind, argsStr] = m;
    const ku = kind.toUpperCase();
    const args = parseCallArgs(argsStr);

    if (ku === 'PERSON' || ku === 'PERSON_EXT') {
      elements.push({ kind: 'person', ext: ku.includes('EXT'), id: args[0] ?? kind, label: args[1] ?? '', desc: args[2] ?? '' });
    } else if (ku.startsWith('SYSTEM')) {
      elements.push({ kind: 'system', ext: ku.includes('EXT'), db: ku.includes('DB'), id: args[0] ?? kind, label: args[1] ?? '', desc: args[2] ?? '' });
    } else if (ku.startsWith('CONTAINER')) {
      elements.push({ kind: 'container', ext: ku.includes('EXT'), db: ku.includes('DB'), id: args[0] ?? kind, label: args[1] ?? '', tech: args[2] ?? '', desc: args[3] ?? '' });
    } else if (ku.startsWith('COMPONENT')) {
      elements.push({ kind: 'component', ext: ku.includes('EXT'), id: args[0] ?? kind, label: args[1] ?? '', tech: args[2] ?? '', desc: args[3] ?? '' });
    } else if (ku === 'BIREL') {
      rels.push({ from: args[0], to: args[1], label: args[2] ?? '', bidir: true });
    } else if (ku.startsWith('REL')) {
      rels.push({ from: args[0], to: args[1], label: args[2] ?? '', bidir: false });
    }
  }

  return { type: 'c4', subtype, title, elements, rels };
}
