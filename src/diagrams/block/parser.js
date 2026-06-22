/**
 * Parses Mermaid `block-beta` syntax into a BlockAST.
 * @module diagrams/block/parser
 *
 * Aims to cover the documented Mermaid block syntax:
 * https://mermaid.js.org/syntax/block.html
 */

let _anon = 0; // counter for auto-generated ids of label-only blocks

/**
 * Parses Mermaid block-diagram text into an AST. Does not touch the DOM.
 *
 * Blocks flow left-to-right into a column grid (`columns N`); a block may span
 * columns (`id:N`), `space[:N]` leaves gaps, and `block:id[:N] … end` nests a
 * sub-grid. Shapes, edges, and `style`/`classDef`/`class` are recognized.
 *
 * @param {string} text - Raw Mermaid block-beta source.
 * @returns {{
 *   type: 'block',
 *   columns: number,
 *   items: Array<object>,
 *   blocks: Array<{ id: string, label: string, shape: string, span: number }>,
 *   edges: Array<{ from: string, to: string, label: string, arrow: string }>,
 *   styles: Object<string, object>
 * }} BlockAST. `items` is the ordered layout tree; `blocks` is a flat list for edge lookup.
 */
export function parseBlock(text) {
  _anon = 0;
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  const ctx = { edges: [], styles: {}, classDefs: {}, classAssign: {} };
  const cur = { i: lines[0] && /^block-beta\b/i.test(lines[0]) ? 1 : 0 };

  const top = parseContainer(lines, cur, ctx);

  // Resolve class assignments into styles (inline `style` already in ctx.styles).
  for (const [id, cls] of Object.entries(ctx.classAssign)) {
    if (ctx.classDefs[cls]) ctx.styles[id] = { ...ctx.classDefs[cls], ...ctx.styles[id] };
  }

  // Flatten all real blocks (incl. composites) for edge endpoint resolution.
  const blocks = [];
  (function collect(items) {
    for (const it of items) {
      if (it.kind === 'block' || it.kind === 'composite') blocks.push(it);
      if (it.items) collect(it.items);
    }
  })(top.items);

  return { type: 'block', columns: top.columns, items: top.items, blocks, edges: ctx.edges, styles: ctx.styles };
}

/**
 * Parse a container body (top level or inside a `block:` … `end`) into ordered
 * items, consuming lines via the shared cursor.
 * @param {string[]} lines - All source lines.
 * @param {{i: number}} cur - Shared line cursor (advanced in place).
 * @param {object} ctx - Shared parse context ({ edges, styles, classDefs, classAssign }).
 * @returns {{columns: number, items: Array<object>}} The container's columns and items.
 */
function parseContainer(lines, cur, ctx) {
  let columns = null;
  const items = [];

  while (cur.i < lines.length) {
    const line = lines[cur.i];
    if (line === 'end') { cur.i++; break; }
    cur.i++;

    let m;
    if ((m = line.match(/^columns\s+(\d+)/i))) { columns = +m[1]; continue; }

    // Nested composite block.
    if ((m = line.match(/^block:(\w+)(?::(\d+))?\s*$/i))) {
      const child = parseContainer(lines, cur, ctx);
      items.push({ kind: 'composite', id: m[1], label: '', span: m[2] ? +m[2] : 1, columns: child.columns, items: child.items });
      continue;
    }

    // Styling.
    if ((m = line.match(/^style\s+(\w+)\s+(.+)/i)))    { ctx.styles[m[1]] = { ...ctx.styles[m[1]], ...parseStyle(m[2]) }; continue; }
    if ((m = line.match(/^classDef\s+(\w+)\s+(.+)/i))) { ctx.classDefs[m[1]] = parseStyle(m[2]); continue; }
    if ((m = line.match(/^class\s+([\w,\s]+?)\s+(\w+)\s*$/i))) { m[1].split(',').map(s => s.trim()).forEach(id => { ctx.classAssign[id] = m[2]; }); continue; }

    // Edge line? (an arrow outside of any quoted label)
    if (hasArrow(line)) { parseEdges(line, ctx.edges); continue; }

    // Otherwise: one or more block-definition tokens.
    for (const tok of tokenize(line)) {
      const sm = tok.match(/^space(?::(\d+))?$/i);
      if (sm) { items.push({ kind: 'space', span: sm[1] ? +sm[1] : 1 }); continue; }
      const blk = parseBlockToken(tok);
      if (blk) items.push(blk);
    }
  }

  // Default columns: lay everything in a single row when not specified.
  if (columns == null) columns = Math.max(1, items.reduce((s, it) => s + (it.span || 1), 0));
  return { columns, items };
}

/**
 * Tokenize a block-definition line on whitespace, keeping quoted text and
 * bracketed shapes together (so `A["Two Words"]:2` stays one token).
 * @param {string} line - The line to tokenize.
 * @returns {string[]} The block tokens.
 */
function tokenize(line) {
  const toks = [];
  let cur = '', q = false, depth = 0;
  for (const ch of line) {
    if (ch === '"') { q = !q; cur += ch; continue; }
    if (!q && '[({<'.includes(ch)) { depth++; cur += ch; continue; }
    if (!q && '])}>'.includes(ch)) { depth = Math.max(0, depth - 1); cur += ch; continue; }
    if (!q && depth === 0 && /\s/.test(ch)) { if (cur) toks.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) toks.push(cur);
  return toks;
}

/**
 * Parse a single block token into a block item: optional id, shape, span.
 * @param {string} tok - The token (e.g. `db[("Database")]:2`).
 * @returns {object|null} A block item, or null if empty.
 */
function parseBlockToken(tok) {
  if (!tok) return null;
  let span = 1;
  const sm = tok.match(/:(\d+)$/);
  if (sm) { span = +sm[1]; tok = tok.slice(0, -sm[0].length); }

  const bi = tok.search(/[[({<>\]]/); // first shape-bracket char
  if (bi < 0) return { kind: 'block', id: tok, label: tok, shape: 'square', span };

  const { shape, label, dir } = parseBlockShape(tok.slice(bi));
  const id = bi > 0 ? tok.slice(0, bi) : (label.replace(/\W+/g, '_') || `b${_anon++}`);
  return { kind: 'block', id, label, shape, span, dir };
}

/**
 * Detect a block shape from its bracket delimiters and strip them to the label.
 * @param {string} body - The bracketed portion of a token (e.g. `[("text")]`).
 * @returns {{shape: string, label: string, dir?: string}} Shape keyword, label, and optional arrow direction.
 */
function parseBlockShape(body) {
  body = body.trim();
  const inner = s => s.replace(/^"|"$/g, '').trim();
  let m;
  if ((m = body.match(/^<\[(.+)\]>\((\w+)\)$/))) return { shape: 'block-arrow', label: inner(m[1]), dir: m[2] };
  if ((m = body.match(/^\(\(\((.+)\)\)\)$/)))    return { shape: 'double-circle', label: inner(m[1]) };
  if ((m = body.match(/^\(\((.+)\)\)$/)))        return { shape: 'circle', label: inner(m[1]) };
  if ((m = body.match(/^\[\((.+)\)\]$/)))        return { shape: 'cylinder', label: inner(m[1]) };
  if ((m = body.match(/^\[\[(.+)\]\]$/)))        return { shape: 'subroutine', label: inner(m[1]) };
  if ((m = body.match(/^\(\[(.+)\]\)$/)))        return { shape: 'stadium', label: inner(m[1]) };
  if ((m = body.match(/^\{\{(.+)\}\}$/)))        return { shape: 'hexagon', label: inner(m[1]) };
  if ((m = body.match(/^\{(.+)\}$/)))            return { shape: 'rhombus', label: inner(m[1]) };
  if ((m = body.match(/^\]([^[]+)\[$/)))         return { shape: 'parallelogram', label: inner(m[1]) };
  if ((m = body.match(/^>(.+)\]$/)))             return { shape: 'asymmetric', label: inner(m[1]) };
  if ((m = body.match(/^\[(.+)\]$/)))            return { shape: 'square', label: inner(m[1]) };
  if ((m = body.match(/^\((.+)\)$/)))            return { shape: 'rounded', label: inner(m[1]) };
  return { shape: 'square', label: inner(body) };
}

/**
 * Whether a line contains an edge arrow (ignoring arrows inside quoted labels).
 * @param {string} line - The line.
 * @returns {boolean} True if an arrow operator is present.
 */
function hasArrow(line) {
  return /(?:-->|---|--x|--o|<-->)/.test(line.replace(/"[^"]*"/g, ''));
}

/**
 * Map an edge operator to a head kind.
 * @param {string} op - One of '-->', '---', '--x', '--o', '<-->'.
 * @returns {string} 'arrow' | 'line' | 'cross' | 'circle' | 'bi'.
 */
function arrowType(op) {
  return op === '---' ? 'line' : op === '--x' ? 'cross' : op === '--o' ? 'circle' : op === '<-->' ? 'bi' : 'arrow';
}

/**
 * Parse an edge line into one or more edges (supports chains and labels).
 * @param {string} line - The edge line.
 * @param {Array<object>} edges - Edge list to append to.
 * @returns {void}
 */
function parseEdges(line, edges) {
  // Labeled: A -- "label" --> B   or   A -->|label| B
  let m = line.match(/^(\w+)\s*--\s*"([^"]*)"\s*(-->|---|--x|--o)\s*(\w+)/);
  if (m) { edges.push({ from: m[1], to: m[4], label: m[2], arrow: arrowType(m[3]) }); return; }
  m = line.match(/^(\w+)\s*(-->|---|--x|--o|<-->)\s*\|([^|]*)\|\s*(\w+)/);
  if (m) { edges.push({ from: m[1], to: m[4], label: m[3], arrow: arrowType(m[2]) }); return; }

  // Plain chain on a single operator: A --> B --> C.
  const opM = line.match(/-->|---|--x|--o|<-->/);
  if (!opM) return;
  const op = opM[0];
  const ids = line.split(op).map(s => s.trim()).filter(Boolean);
  for (let i = 0; i < ids.length - 1; i++) {
    if (/^\w+$/.test(ids[i]) && /^\w+$/.test(ids[i + 1])) edges.push({ from: ids[i], to: ids[i + 1], label: '', arrow: arrowType(op) });
  }
}

/**
 * Parse a `style`/`classDef` declaration string into a property map.
 * @param {string} str - Comma-separated `key:value` declarations.
 * @returns {Object<string, string>} The style map.
 */
function parseStyle(str) {
  const out = {};
  for (const part of str.split(',')) {
    const idx = part.indexOf(':');
    if (idx > 0) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}
