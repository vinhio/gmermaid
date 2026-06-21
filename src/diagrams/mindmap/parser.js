/**
 * Parses Mermaid mindmap syntax into a MindmapAST (a tree of nodes).
 * @module diagrams/mindmap/parser
 */

/**
 * Detect a node's shape from its surrounding delimiters and strip them to the label.
 * Recognized: `((circle))`, `(rounded)`, `[rect]`, `{{hexagon}}`, `>bang]`, `)cloud(`.
 * Anything else is treated as a plain `rounded` node.
 * @param {string} raw - The raw node text (delimiters included).
 * @returns {{shape: string, label: string}} The shape keyword and inner label.
 */
function parseShape(raw) {
  raw = raw.trim();
  if (/^\(\((.+)\)\)$/.test(raw)) return { shape: 'circle', label: raw.slice(2, -2).trim() };
  if (/^\((.+)\)$/.test(raw))       return { shape: 'rounded', label: raw.slice(1, -1).trim() };
  if (/^\[(.+)\]$/.test(raw))       return { shape: 'rect', label: raw.slice(1, -1).trim() };
  if (/^\{\{(.+)\}\}$/.test(raw)) return { shape: 'hexagon', label: raw.slice(2, -2).trim() };
  if (/^>(.+)\]$/.test(raw))         return { shape: 'bang', label: raw.slice(1, -1).trim() };
  if (/^\)(.+)\($/.test(raw))       return { shape: 'cloud', label: raw.slice(1, -1).trim() };
  return { shape: 'rounded', label: raw };
}

/** Monotonic counter backing {@link uid}; reset at the start of each parse. */
let _id = 0;
/**
 * Generate a unique node id for this parse run.
 * @returns {string} An id like "mm0", "mm1", ...
 */
function uid() { return `mm${_id++}`; }

/**
 * Parse Mermaid mindmap text into a MindmapAST.
 *
 * Indentation defines the hierarchy: a node attaches to the nearest preceding
 * node with strictly smaller indentation. A stack of `{ indent, node }` tracks
 * the current ancestor chain; the first node becomes the tree root.
 *
 * @param {string} text - Raw Mermaid mindmap source.
 * @returns {{type: 'mindmap', root: (null|{id: string, shape: string, label: string, children: Array})}}
 *   MindmapAST. `root` is the top node (null if empty); each node has a unique
 *   `id`, a `shape` keyword, a `label`, and a `children` array.
 */
export function parseMindmap(text) {
  _id = 0;
  const lines = text.split('\n');
  const nodeStack = []; // { indent, node }

  let root = null;

  for (const line of lines) {
    const raw = line.trimEnd();
    if (!raw.trim() || /^mindmap\b/i.test(raw.trim()) || raw.trim().startsWith('%%')) continue;
    if (raw.trim().startsWith('::icon(')) continue;

    const indent = raw.match(/^\s*/)[0].length;
    const content = raw.trim();

    const { shape, label } = parseShape(content);
    const node = { id: uid(), shape, label, children: [] };

    // Pop ancestors whose indent is >= this node's, so the stack top becomes the parent.
    while (nodeStack.length > 0 && nodeStack[nodeStack.length - 1].indent >= indent) {
      nodeStack.pop();
    }

    if (nodeStack.length > 0) {
      nodeStack[nodeStack.length - 1].node.children.push(node);
    } else {
      root = node;
    }
    nodeStack.push({ indent, node });
  }

  return { type: 'mindmap', root };
}
