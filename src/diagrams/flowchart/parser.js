/**
 * Flowchart parser: turns Mermaid `flowchart`/`graph` source text into a
 * FlowchartAST. Pure data transformation — performs no DOM work. Aims to cover
 * the documented Mermaid flowchart syntax:
 * https://mermaid.js.org/syntax/flowchart.html
 */

/** An edge link operator: optional start head, a solid/thick/dotted body, optional end head. */
const EDGE_OP = '[ox<]?(?:-{2,}|={2,}|-\\.+-)[ox>]?';

/**
 * Parse Mermaid flowchart source into an AST.
 * @param {string} text - Raw Mermaid flowchart/graph source.
 * @returns {{
 *   type: 'flowchart',
 *   direction: 'TB'|'LR'|'RL'|'BT',
 *   nodes: Array<{id: string, label: string, shape: string, x: number, y: number, w: number, h: number, classes: string[], style?: object}>,
 *   edges: Array<{from: string, to: string, label: string, line: 'solid'|'thick'|'dotted', startHead: string|null, endHead: string|null}>,
 *   subgraphs: Array<{id: string, title: string, nodes: string[], direction: string|null}>
 * }} The flowchart AST.
 */
export function parseFlowchart(text) {
  // Normalize: trim each line and drop blanks plus `%%` comment lines.
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('%%'));

  const nodes      = [];
  const edges      = [];
  const classDefs  = {};   // classDef name -> style object
  const classMap   = {};   // node id -> class name (from `class` / `:::`)
  const nodeStyles = {};   // node id -> inline style object (from `style`)
  const nodeMap    = new Map(); // node id -> node object (dedupes references)
  const subgraphs  = [];
  const sgStack    = [];   // open subgraphs (innermost last)

  /**
   * Look up an existing node by id or create one, merging label/shape/class and
   * recording subgraph membership.
   * @param {{id: string, label?: string, shape?: string, cssClass?: string|null}} ref - Parsed node reference.
   * @returns {object} The node object stored in nodeMap.
   */
  function register(ref) {
    let n = nodeMap.get(ref.id);
    if (!n) {
      n = { id: ref.id, label: ref.label ?? ref.id, shape: ref.shape ?? 'rect', x: 0, y: 0, w: 0, h: 0, classes: [] };
      nodeMap.set(ref.id, n);
      nodes.push(n);
    } else {
      if (ref.label !== undefined && ref.label !== ref.id) n.label = ref.label;
      if (ref.shape && ref.shape !== 'rect') n.shape = ref.shape;
    }
    if (ref.cssClass) classMap[ref.id] = ref.cssClass;
    for (const sg of sgStack) if (!sg.nodes.includes(ref.id)) sg.nodes.push(ref.id);
    return n;
  }

  // Direction from the first line (TD is an alias for TB).
  let direction = 'TB';
  const dirMatch = (lines[0] ?? '').match(/^(?:flowchart|graph)\s+(LR|RL|TB|TD|BT)/i);
  if (dirMatch) direction = dirMatch[1].toUpperCase() === 'TD' ? 'TB' : dirMatch[1].toUpperCase();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // subgraph [id] [title] / subgraph "title"
    const sgM = line.match(/^subgraph\s+(.+)$/i);
    if (sgM) {
      const spec = sgM[1].trim();
      const idTitle = spec.match(/^(\w[\w-]*)\s*\[(.+?)\]$/);
      const sg = idTitle
        ? { id: idTitle[1], title: cleanLabel(idTitle[2]), nodes: [], direction: null }
        : { id: spec.replace(/[^\w]+/g, '_'), title: cleanLabel(spec), nodes: [], direction: null };
      subgraphs.push(sg);
      sgStack.push(sg);
      continue;
    }
    if (line === 'end') { sgStack.pop(); continue; }

    // direction (inside a subgraph it sets that subgraph's flow; else the diagram's)
    const inDirM = line.match(/^direction\s+(TB|TD|BT|LR|RL)\b/i);
    if (inDirM) {
      const d = inDirM[1].toUpperCase() === 'TD' ? 'TB' : inDirM[1].toUpperCase();
      if (sgStack.length) sgStack[sgStack.length - 1].direction = d; else direction = d;
      continue;
    }

    const cdMatch = line.match(/^classDef\s+(\w+)\s+(.+)/);
    if (cdMatch) { classDefs[cdMatch[1]] = parseStyleStr(cdMatch[2]); continue; }

    const clMatch = line.match(/^class\s+([\w,\s]+)\s+(\w+)\s*$/);
    if (clMatch) { clMatch[1].split(',').map(s => s.trim()).forEach(id => { classMap[id] = clMatch[2]; }); continue; }

    const styleMatch = line.match(/^style\s+(\w[\w-]*)\s+(.+)/);
    if (styleMatch) { nodeStyles[styleMatch[1]] = parseStyleStr(styleMatch[2]); continue; }

    // Interaction/link-styling directives — recognized but not rendered; skip.
    if (/^(click|href|linkStyle)\b/i.test(line)) continue;

    const edgeParsed = parseEdgeLine(line);
    if (edgeParsed) {
      const { fromRefs, toRefs, label, line: ls, startHead, endHead } = edgeParsed;
      fromRefs.forEach(register);
      toRefs.forEach(register);
      // `&` on either side fans out to the cross product of endpoints.
      for (const f of fromRefs) for (const t of toRefs) {
        edges.push({ from: f.id, to: t.id, label, line: ls, startHead, endHead });
      }
      continue;
    }

    // Bare node definition(s), possibly `A & B` on one line.
    for (const tok of line.split('&')) {
      const ref = parseNodeRef(tok.trim());
      if (ref) register(ref);
    }
  }

  // Resolve sizes (after labels are known) so the layout can avoid overlaps.
  for (const n of nodes) Object.assign(n, sizeNode(n.label));

  // Apply class + inline styles.
  for (const [id, cls] of Object.entries(classMap)) {
    const n = nodeMap.get(id);
    if (n) { n.style = { ...classDefs[cls], ...n.style }; if (!n.classes.includes(cls)) n.classes.push(cls); }
  }
  for (const [id, style] of Object.entries(nodeStyles)) {
    const n = nodeMap.get(id);
    if (n) n.style = { ...n.style, ...style };
  }

  return { type: 'flowchart', direction, nodes, edges, subgraphs };
}

/**
 * Estimate a node's box size from its (possibly multi-line) label.
 * @param {string} label - The node label (may contain `<br>`).
 * @returns {{w: number, h: number}} Fitted width/height in px.
 */
function sizeNode(label) {
  const lines = splitBr(label);
  const longest = Math.max(...lines.map(l => l.length), 1);
  const w = Math.min(360, Math.max(84, Math.ceil(longest * 7.8 + 30)));
  const h = Math.max(44, lines.length * 20 + 24);
  return { w, h };
}

/**
 * Split a label on `<br>` / `<br/>` into trimmed lines.
 * @param {string} s - The label text.
 * @returns {string[]} One or more lines.
 */
export function splitBr(s) {
  return String(s).split(/<br\s*\/?>/i).map(t => t.trim());
}

/**
 * Strip surrounding quotes and whitespace from a label.
 * @param {string} s - Raw captured label.
 * @returns {string} Cleaned label.
 */
function cleanLabel(s) {
  s = s.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s;
}

/**
 * Parse a single node reference (id + optional shape brackets + optional
 * `:::class`) into its parts. Regexes are ordered most-specific first so the
 * longest delimiter wins.
 * @param {string} str - A node token.
 * @returns {{id: string, label: string, shape: string, cssClass: string|null}|null} Parsed node, or null.
 */
export function parseNodeRef(str) {
  str = str.trim();
  let cssClass = null;
  const cm = str.match(/^(.*?):::(\w+)$/);
  if (cm) { str = cm[1].trim(); cssClass = cm[2]; }

  const mk = (id, label, shape) => ({ id, label: cleanLabel(label), shape, cssClass });
  let m;
  if ((m = str.match(/^(\w[\w-]*)\(\(\((.+?)\)\)\)$/))) return mk(m[1], m[2], 'double-circle');
  if ((m = str.match(/^(\w[\w-]*)\[\((.+?)\)\]$/)))     return mk(m[1], m[2], 'cylinder');
  if ((m = str.match(/^(\w[\w-]*)\[\[(.+?)\]\]$/)))     return mk(m[1], m[2], 'subroutine');
  if ((m = str.match(/^(\w[\w-]*)\(\[(.+?)\]\)$/)))     return mk(m[1], m[2], 'stadium');
  if ((m = str.match(/^(\w[\w-]*)\(\((.+?)\)\)$/)))     return mk(m[1], m[2], 'circle');
  if ((m = str.match(/^(\w[\w-]*)\{\{(.+?)\}\}$/)))     return mk(m[1], m[2], 'hexagon');
  if ((m = str.match(/^(\w[\w-]*)\[\/(.+?)\\\]$/)))     return mk(m[1], m[2], 'trapezoid');      // [/..\]
  if ((m = str.match(/^(\w[\w-]*)\[\\(.+?)\/\]$/)))     return mk(m[1], m[2], 'trapezoid-alt');  // [\../]
  if ((m = str.match(/^(\w[\w-]*)\[\/(.+?)\/\]$/)))     return mk(m[1], m[2], 'parallelogram');  // [/../]
  if ((m = str.match(/^(\w[\w-]*)\[\\(.+?)\\\]$/)))     return mk(m[1], m[2], 'parallelogram-alt'); // [\..\]
  if ((m = str.match(/^(\w[\w-]*)\[(.+?)\]$/)))         return mk(m[1], m[2], 'rect');
  if ((m = str.match(/^(\w[\w-]*)\{(.+?)\}$/)))         return mk(m[1], m[2], 'diamond');
  if ((m = str.match(/^(\w[\w-]*)>(.+?)\]$/)))          return mk(m[1], m[2], 'asymmetric');
  if ((m = str.match(/^(\w[\w-]*)\((.+?)\)$/)))         return mk(m[1], m[2], 'round');
  if ((m = str.match(/^(\w[\w-]*)$/)))                  return mk(m[1], m[1], 'rect');
  return null;
}

/**
 * Parse an edge line into endpoint reference lists (after `&` expansion), label,
 * line style, and head markers. Returns null if the line is not a valid edge.
 * @param {string} line - A single source line.
 * @returns {{fromRefs: object[], toRefs: object[], label: string, line: string, startHead: string|null, endHead: string|null}|null}
 */
function parseEdgeLine(line) {
  let leftStr, rightStr, label = '', op = null, style = null;

  // Pattern 1: A op|label| B
  let m = line.match(new RegExp(`^(.+?)\\s*(${EDGE_OP})\\s*\\|([^|]*)\\|\\s*(.+)$`));
  if (m) { leftStr = m[1]; op = m[2]; label = m[3].trim(); rightStr = m[4]; }

  // Pattern 2: A -- label --> B (text between the dashes, solid only)
  if (!m) {
    m = line.match(/^(.+?)\s+-{2,}\s+(.+?)\s+-{2,}([ox>])\s*(.+)$/);
    if (m) { leftStr = m[1]; label = m[2].trim(); rightStr = m[4]; style = { line: 'solid', startHead: null, endHead: headOf(m[3]) }; }
  }

  // Pattern 3: A op B (no label)
  if (!m) {
    m = line.match(new RegExp(`^(.+?)\\s*(${EDGE_OP})\\s*(.+)$`));
    if (m) { leftStr = m[1]; op = m[2]; rightStr = m[3]; }
  }

  if (!m) return null;

  const fromRefs = leftStr.split('&').map(s => parseNodeRef(s.trim())).filter(Boolean);
  const toRefs   = rightStr.split('&').map(s => parseNodeRef(s.trim())).filter(Boolean);
  // Guard against the operator matching inside a label (then a side won't parse).
  if (!fromRefs.length || !toRefs.length ||
      fromRefs.length !== leftStr.split('&').length ||
      toRefs.length !== rightStr.split('&').length) return null;

  const s = style ?? edgeStyle(op);
  return { fromRefs, toRefs, label, ...s };
}

/**
 * Map a single head character to a head kind.
 * @param {string} c - One of '>', 'o', 'x', or another char.
 * @returns {string|null} 'arrow' | 'circle' | 'cross' | null.
 */
function headOf(c) {
  return c === '>' ? 'arrow' : c === 'o' ? 'circle' : c === 'x' ? 'cross' : null;
}

/**
 * Decode an edge operator into line style and start/end heads.
 * @param {string} op - The operator token (e.g. '-->', '==>', '-.->', 'o--o', '<-->').
 * @returns {{line: 'solid'|'thick'|'dotted', startHead: string|null, endHead: string|null}} Edge style.
 */
function edgeStyle(op) {
  const line = op.includes('=') ? 'thick' : op.includes('.') ? 'dotted' : 'solid';
  const start = op[0] === '<' ? 'arrow' : headOf(op[0]);
  const end   = headOf(op[op.length - 1]);
  return { line, startHead: start, endHead: end };
}

/**
 * Parse a `classDef`/`style` style string ("k1:v1,k2:v2") into an object.
 * @param {string} str - Comma-separated `key:value` style declarations.
 * @returns {Object<string, string>} Map of CSS property to value.
 */
function parseStyleStr(str) {
  const result = {};
  for (const part of str.split(',')) {
    const idx = part.indexOf(':');
    if (idx > 0) result[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return result;
}
