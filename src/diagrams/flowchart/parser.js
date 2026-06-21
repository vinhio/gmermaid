/**
 * Flowchart parser: turns Mermaid `flowchart`/`graph` source text into a
 * FlowchartAST. Pure data transformation — performs no DOM work.
 */

/**
 * Parse Mermaid flowchart source into an AST.
 * @param {string} text - Raw Mermaid flowchart/graph source.
 * @returns {{ type: 'flowchart', direction: 'TB'|'LR'|'RL'|'BT', nodes: Array<{id: string, label: string, shape: string, x: number, y: number, w: number, h: number, classes: string[], style?: object}>, edges: Array<{from: string, to: string, label: string, type: 'arrow'|'line'|'thick'|'dotted'}> }} The flowchart AST.
 */
export function parseFlowchart(text) {
  // Normalize: trim each line and drop blanks plus `%%` comment lines.
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('%%'));

  const nodes      = [];
  const edges      = [];
  const classDefs  = {};   // classDef name -> style object
  const classMap   = {};   // node id -> class name (from `class` statements)
  const nodeStyles = {};   // node id -> inline style object (from `style` statements)
  const nodeMap    = new Map(); // node id -> node object (dedupes references)

  /**
   * Look up an existing node by id or create one, merging in any new label/shape.
   * @param {string} id - Node identifier.
   * @param {string} [label] - Display label; defaults to the id.
   * @param {string} [shape] - Shape keyword; defaults to 'rect'.
   * @returns {object} The node object stored in nodeMap.
   */
  function getOrCreate(id, label, shape) {
    if (!nodeMap.has(id)) {
      const n = { id, label: label ?? id, shape: shape ?? 'rect', x: 0, y: 0, w: 140, h: 44, classes: [] };
      nodeMap.set(id, n);
      nodes.push(n);
    } else {
      const n = nodeMap.get(id);
      if (label !== undefined) n.label = label;
      if (shape !== undefined && shape !== 'rect') n.shape = shape;
    }
    return nodeMap.get(id);
  }

  // Detect direction from first line
  let direction = 'TB';
  const firstLine = lines[0] ?? '';
  const dirMatch = firstLine.match(/^(?:flowchart|graph)\s+(LR|RL|TB|TD|BT)/i);
  if (dirMatch) {
    direction = dirMatch[1].toUpperCase() === 'TD' ? 'TB' : dirMatch[1].toUpperCase();
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    if (/^subgraph\b/.test(line) || line === 'end') continue;

    const cdMatch = line.match(/^classDef\s+(\w+)\s+(.+)/);
    if (cdMatch) { classDefs[cdMatch[1]] = parseStyleStr(cdMatch[2]); continue; }

    const clMatch = line.match(/^class\s+([\w,\s]+)\s+(\w+)/);
    if (clMatch) {
      clMatch[1].split(',').map(s => s.trim()).forEach(id => { classMap[id] = clMatch[2]; });
      continue;
    }

    const styleMatch = line.match(/^style\s+(\w+)\s+(.+)/);
    if (styleMatch) { nodeStyles[styleMatch[1]] = parseStyleStr(styleMatch[2]); continue; }

    const edgeParsed = parseEdgeLine(line);
    if (edgeParsed) {
      const { fromId, fromLabel, fromShape, toId, toLabel, toShape, edgeLabel, edgeType } = edgeParsed;
      getOrCreate(fromId, fromLabel, fromShape);
      getOrCreate(toId,   toLabel,   toShape);
      edges.push({ from: fromId, to: toId, label: edgeLabel ?? '', type: edgeType ?? 'arrow' });
      continue;
    }

    const nodeDef = parseNodeRef(line);
    if (nodeDef) getOrCreate(nodeDef.id, nodeDef.label, nodeDef.shape);
  }

  // Apply class styles
  for (const [id, cls] of Object.entries(classMap)) {
    const n = nodeMap.get(id);
    if (n) { n.style = { ...classDefs[cls], ...n.style }; n.classes.push(cls); }
  }
  for (const [id, style] of Object.entries(nodeStyles)) {
    const n = nodeMap.get(id);
    if (n) n.style = { ...n.style, ...style };
  }

  return { type: 'flowchart', direction, nodes, edges };
}

/**
 * Parse a single node reference such as `A`, `A[label]`, `A(label)`,
 * `A{label}`, `A((label))`, etc., into its id/label/shape.
 * The regexes are ordered most-specific first (e.g. `[[...]]` before `[...]`)
 * so the longest delimiter wins.
 * @param {string} str - A node token, possibly with shape brackets and label.
 * @returns {{ id: string, label: string, shape: string }|null} Parsed node, or null if not a node ref.
 */
export function parseNodeRef(str) {
  str = str.trim();

  let m;

  m = str.match(/^(\w[\w-]*)\[\((.+?)\)\]$/);
  if (m) return { id: m[1], label: m[2], shape: 'cylinder' };

  m = str.match(/^(\w[\w-]*)\[\[(.+?)\]\]$/);
  if (m) return { id: m[1], label: m[2], shape: 'subroutine' };

  m = str.match(/^(\w[\w-]*)\[\/(.+?)\/\]$/);
  if (m) return { id: m[1], label: m[2], shape: 'parallelogram' };

  m = str.match(/^(\w[\w-]*)\[\\(.+?)\\\]$/);
  if (m) return { id: m[1], label: m[2], shape: 'parallelogram-alt' };

  m = str.match(/^(\w[\w-]*)\[(.+?)\]$/);
  if (m) return { id: m[1], label: m[2], shape: 'rect' };

  m = str.match(/^(\w[\w-]*)\(\((.+?)\)\)$/);
  if (m) return { id: m[1], label: m[2], shape: 'circle' };

  m = str.match(/^(\w[\w-]*)\((.+?)\)$/);
  if (m) return { id: m[1], label: m[2], shape: 'round' };

  m = str.match(/^(\w[\w-]*)\{(.+?)\}$/);
  if (m) return { id: m[1], label: m[2], shape: 'diamond' };

  m = str.match(/^(\w[\w-]*)>(.+?)\]$/);
  if (m) return { id: m[1], label: m[2], shape: 'asymmetric' };

  m = str.match(/^(\w[\w-]*)$/);
  if (m) return { id: m[1], label: m[1], shape: 'rect' };

  return null;
}

/**
 * Parse an edge line connecting two node references, in any of three syntaxes.
 * @param {string} line - A single source line.
 * @returns {{ fromId: string, fromLabel?: string, fromShape?: string, toId: string, toLabel?: string, toShape?: string, edgeLabel: string, edgeType: string }|null} Parsed edge endpoints/label/type, or null if the line is not an edge.
 */
function parseEdgeLine(line) {
  // Pattern 1: A -->|label| B  (operator, then pipe-delimited label, then target)
  const p1 = line.match(/^(.+?)\s*(--[->]?-*>?|--[->]?|==[=>]?|-.->|-\.-)\s*\|([^|]*)\|\s*(.+)$/);
  if (p1) {
    const from = parseNodeRef(p1[1].trim());
    const to   = parseNodeRef(p1[4].trim());
    if (from && to) return { fromId: from.id, fromLabel: labelOrUndef(from), fromShape: shapeOrUndef(from),
      toId: to.id, toLabel: labelOrUndef(to), toShape: shapeOrUndef(to),
      edgeLabel: p1[3].trim(), edgeType: opToType(p1[2]) };
  }

  // Pattern 2: A -- label --> B  (label sits between the dashes)
  const p2 = line.match(/^(.+?)\s*--\s+([^-]+?)\s+-->\s*(.+)$/);
  if (p2) {
    const from = parseNodeRef(p2[1].trim());
    const to   = parseNodeRef(p2[3].trim());
    if (from && to) return { fromId: from.id, fromLabel: labelOrUndef(from), fromShape: shapeOrUndef(from),
      toId: to.id, toLabel: labelOrUndef(to), toShape: shapeOrUndef(to),
      edgeLabel: p2[2].trim(), edgeType: 'arrow' };
  }

  // Pattern 3: A --> B  (no label)
  const p3 = line.match(/^(.+?)\s*(--[->]?-*>?|--[->]?|==[=>]?|-.->|-\.-)\s*(.+)$/);
  if (p3) {
    const from = parseNodeRef(p3[1].trim());
    const to   = parseNodeRef(p3[3].trim());
    if (from && to) return { fromId: from.id, fromLabel: labelOrUndef(from), fromShape: shapeOrUndef(from),
      toId: to.id, toLabel: labelOrUndef(to), toShape: shapeOrUndef(to),
      edgeLabel: '', edgeType: opToType(p3[2]) };
  }

  return null;
}

/**
 * Return a ref's label only when it differs from the id (otherwise undefined).
 * @param {{ id: string, label: string }} ref - Parsed node reference.
 * @returns {string|undefined} The explicit label, or undefined.
 */
function labelOrUndef(ref) { return ref.label !== ref.id ? ref.label : undefined; }

/**
 * Return a ref's shape only when it is not the default 'rect' (otherwise undefined).
 * @param {{ shape: string }} ref - Parsed node reference.
 * @returns {string|undefined} The explicit shape, or undefined.
 */
function shapeOrUndef(ref) { return ref.shape !== 'rect' ? ref.shape : undefined; }

/**
 * Map an edge operator string to a logical edge type.
 * @param {string} op - The matched operator (e.g. '-->', '==>', '-.->').
 * @returns {'arrow'|'thick'|'dotted'|'line'} The edge type.
 */
function opToType(op) {
  if (!op) return 'arrow';
  if (op.startsWith('==')) return 'thick';  // ===/==> thick edges
  if (op.includes('.')) return 'dotted';    // -.-> dotted edges
  if (op.endsWith('>')) return 'arrow';     // ends with arrowhead
  return 'line';                            // plain line, no head
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
