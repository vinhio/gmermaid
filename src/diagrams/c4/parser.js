/**
 * Parses Mermaid C4 syntax (C4Context/Container/Component/Dynamic/Deployment).
 * @module diagrams/c4/parser
 *
 * Aims to cover the documented Mermaid C4 syntax:
 * https://mermaid.js.org/syntax/c4.html
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
  // Drop `$key=value` named args (sprite/tags/link) — keep only positional ones.
  return args.filter(a => !/^\$\w+\s*=/.test(a));
}

/** Boundary call names → a normalized boundary kind. */
const BOUNDARY_KINDS = {
  BOUNDARY: 'boundary', ENTERPRISE_BOUNDARY: 'enterprise', SYSTEM_BOUNDARY: 'system',
  CONTAINER_BOUNDARY: 'container', DEPLOYMENT_NODE: 'node', NODE: 'node', NODE_L: 'node', NODE_R: 'node',
};

/**
 * Parses Mermaid C4 diagram text into an AST. Does not touch the DOM.
 *
 * @param {string} text - Raw Mermaid C4 source.
 * @returns {{
 *   type: 'c4',
 *   subtype: 'context'|'container'|'component'|'dynamic'|'deployment',
 *   title: string,
 *   elements: Array<{ kind: string, ext: boolean, db: boolean, queue: boolean, id: string, label: string, tech: string, desc: string, parent: string|null }>,
 *   boundaries: Array<{ id: string, label: string, kind: string, parent: string|null }>,
 *   rels: Array<{ from: string, to: string, label: string, tech: string, bidir: boolean, dir: string|null }>
 * }} C4AST.
 */
export function parseC4(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  let subtype = 'context';
  let title = '';
  const elements = [];
  const boundaries = [];
  const rels = [];
  const stack = []; // open boundary ids (innermost last)
  const parent = () => (stack.length ? stack[stack.length - 1] : null);

  for (const raw of lines) {
    if (/^C4Context\b/i.test(raw))     { subtype = 'context'; continue; }
    if (/^C4Container\b/i.test(raw))   { subtype = 'container'; continue; }
    if (/^C4Component\b/i.test(raw))   { subtype = 'component'; continue; }
    if (/^C4Dynamic\b/i.test(raw))     { subtype = 'dynamic'; continue; }
    if (/^C4Deployment\b/i.test(raw))  { subtype = 'deployment'; continue; }
    if (/^title\s+/i.test(raw))        { title = raw.replace(/^title\s+/i, '').trim(); continue; }
    if (raw === '}')                   { stack.pop(); continue; }

    // A boundary opener ends with `{`; strip it and remember to push the stack.
    let line = raw, opensBoundary = false;
    if (line.endsWith('{')) { opensBoundary = true; line = line.slice(0, -1).trim(); }

    const m = line.match(/^(\w+)\((.*)\)\s*$/);
    if (!m) continue;
    const [, kind, argsStr] = m;
    const ku = kind.toUpperCase();
    const args = parseCallArgs(argsStr);

    // Boundaries (may open a brace block).
    if (ku in BOUNDARY_KINDS) {
      const b = { id: args[0] ?? kind, label: args[1] ?? '', kind: BOUNDARY_KINDS[ku], parent: parent() };
      boundaries.push(b);
      if (opensBoundary) stack.push(b.id);
      continue;
    }

    const base = { ext: ku.includes('EXT'), db: ku.includes('DB'), queue: ku.includes('QUEUE'), parent: parent() };

    if (ku === 'PERSON' || ku === 'PERSON_EXT') {
      elements.push({ kind: 'person', ...base, id: args[0] ?? kind, label: args[1] ?? '', tech: '', desc: args[2] ?? '' });
    } else if (ku.startsWith('SYSTEM')) {
      elements.push({ kind: 'system', ...base, id: args[0] ?? kind, label: args[1] ?? '', tech: '', desc: args[2] ?? '' });
    } else if (ku.startsWith('CONTAINER')) {
      elements.push({ kind: 'container', ...base, id: args[0] ?? kind, label: args[1] ?? '', tech: args[2] ?? '', desc: args[3] ?? '' });
    } else if (ku.startsWith('COMPONENT')) {
      elements.push({ kind: 'component', ...base, id: args[0] ?? kind, label: args[1] ?? '', tech: args[2] ?? '', desc: args[3] ?? '' });
    } else if (ku === 'BIREL') {
      rels.push({ from: args[0], to: args[1], label: args[2] ?? '', tech: args[3] ?? '', bidir: true, dir: null });
    } else if (ku.startsWith('REL')) {
      rels.push({ from: args[0], to: args[1], label: args[2] ?? '', tech: args[3] ?? '', bidir: false, dir: relDir(ku) });
    }
    // Update*/other calls are recognized but not modeled — skipped.
  }

  return { type: 'c4', subtype, title, elements, boundaries, rels };
}

/**
 * Extract the layout-direction hint from a directional `Rel_*` call name.
 * @param {string} ku - Upper-cased relationship function name.
 * @returns {string|null} 'up' | 'down' | 'left' | 'right' | 'back' | null.
 */
function relDir(ku) {
  if (ku === 'REL_U' || ku === 'REL_UP')    return 'up';
  if (ku === 'REL_D' || ku === 'REL_DOWN')  return 'down';
  if (ku === 'REL_L' || ku === 'REL_LEFT')  return 'left';
  if (ku === 'REL_R' || ku === 'REL_RIGHT') return 'right';
  if (ku === 'REL_BACK') return 'back';
  return null;
}
