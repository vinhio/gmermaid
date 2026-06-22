/**
 * Parses Mermaid mindmap syntax into a MindmapAST (a tree of nodes).
 * @module diagrams/mindmap/parser
 */

/**
 * Parse a node's text into shape, label, optional class and icon. A node may
 * carry an optional leading id before the bracket (e.g. `root((Root))`), a
 * trailing `:::class`, and a trailing `::icon(...)`. Markdown backticks/markers
 * are stripped from the label.
 * Shapes: `((circle))`, `(rounded)`, `[rect]`, `{{hexagon}}`, `))bang((`, `)cloud(`.
 * @param {string} raw - The raw node text.
 * @returns {{shape: string, label: string, cls: (string|null), icon: (string|null)}} Parsed node.
 */
function parseShape(raw) {
  raw = raw.trim();

  // Trailing `:::class` and `::icon(...)` decorators (either order).
  let cls = null, icon = null;
  for (let changed = true; changed; ) {
    changed = false;
    const cm = raw.match(/:::([\w-]+)\s*$/);
    if (cm) { cls = cm[1]; raw = raw.slice(0, cm.index).trim(); changed = true; }
    const im = raw.match(/::icon\(([^)]*)\)\s*$/);
    if (im) { icon = im[1].trim(); raw = raw.slice(0, im.index).trim(); changed = true; }
  }

  // Optional leading id, then a shape bracket pair. Double brackets first.
  const ID = '(?:[\\w-]+)?';
  let m, shape = 'default', label = raw;
  if      ((m = raw.match(new RegExp(`^${ID}\\)\\)(.+)\\(\\($`))))  { shape = 'bang';    label = m[1]; }
  else if ((m = raw.match(new RegExp(`^${ID}\\(\\((.+)\\)\\)$`))))  { shape = 'circle';  label = m[1]; }
  else if ((m = raw.match(new RegExp(`^${ID}\\{\\{(.+)\\}\\}$`))))  { shape = 'hexagon'; label = m[1]; }
  else if ((m = raw.match(new RegExp(`^${ID}\\[(.+)\\]$`))))        { shape = 'rect';    label = m[1]; }
  else if ((m = raw.match(new RegExp(`^${ID}\\)(.+)\\($`))))        { shape = 'cloud';   label = m[1]; }
  else if ((m = raw.match(new RegExp(`^${ID}\\((.+)\\)$`))))        { shape = 'rounded'; label = m[1]; }

  return { shape, label: stripMarkdown(label), cls, icon };
}

/**
 * Strip markdown-string backticks and basic emphasis markers from a label.
 * @param {string} s - The raw label.
 * @returns {string} The cleaned label.
 */
function stripMarkdown(s) {
  s = s.trim();
  // Peel matched surrounding quotes/backticks (markdown-string wrappers).
  while (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === '`' && s[s.length - 1] === '`'))) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/<br\s*\/?>/gi, ' ').trim();
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
    const content = raw.trim();
    if (!content || /^mindmap\b/i.test(content) || content.startsWith('%%')) continue;

    // A standalone `::icon(...)` or `:::class` line decorates the current node
    // (older Mermaid form) rather than creating a new node.
    const topNode = nodeStack.length ? nodeStack[nodeStack.length - 1].node : null;
    const iconOnly = content.match(/^::icon\(([^)]*)\)$/);
    if (iconOnly) { if (topNode) topNode.icon = iconOnly[1].trim(); continue; }
    const clsOnly = content.match(/^:::([\w-]+)$/);
    if (clsOnly) { if (topNode) topNode.cls = clsOnly[1]; continue; }

    const indent = raw.match(/^\s*/)[0].length;
    const { shape, label, cls, icon } = parseShape(content);
    const node = { id: uid(), shape, label, cls, icon, children: [] };

    // Pop ancestors whose indent is >= this node's, so the stack top becomes the parent.
    while (nodeStack.length > 0 && nodeStack[nodeStack.length - 1].indent >= indent) {
      nodeStack.pop();
    }

    if (nodeStack.length > 0) {
      nodeStack[nodeStack.length - 1].node.children.push(node);
    } else if (!root) {
      root = node;
    } else {
      // Mermaid allows a single root; attach extra top-level nodes to it.
      root.children.push(node);
    }
    nodeStack.push({ indent, node });
  }

  return { type: 'mindmap', root };
}
