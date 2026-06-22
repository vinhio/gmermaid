/**
 * @file Parses Mermaid `kanban` syntax into a KanbanAST.
 *
 * Structure is indentation-based: lines at the first detected indent are column
 * headers; deeper-indented lines are cards within the current column. Columns
 * and cards may be `id[Label]`, a bare `id`, or plain text; cards may carry an
 * `@{ key: value, ... }` metadata block (assigned, ticket, priority, …).
 * Parsing never touches the DOM. https://mermaid.js.org/syntax/kanban.html
 */

let _anon = 0; // counter for auto-generated ids of label-only nodes

/**
 * Parse Mermaid kanban text into a KanbanAST.
 *
 * @param {string} text - Raw kanban source.
 * @returns {{
 *   type: 'kanban',
 *   columns: Array<{
 *     id: string,
 *     label: string,
 *     cards: Array<{ id: string, label: string, [meta: string]: string }>
 *   }>
 * }} AST of columns, each with its ordered cards and any parsed metadata props.
 */
export function parseKanban(text) {
  _anon = 0;
  const lines = text.split('\n');
  const columns = [];
  let currentColumn = null;
  let colIndent = null; // indent width of the first column line (auto-detected)

  for (const line of lines) {
    const l = line.trimEnd();
    if (!l.trim() || l.trim().startsWith('%%') || /^kanban\b/i.test(l.trim())) continue;

    const indent  = l.match(/^\s*/)[0].length;
    const content = l.trim();
    if (colIndent === null) colIndent = indent;

    if (indent <= colIndent) {
      // Column header.
      const { id, label } = parseNode(content);
      currentColumn = { id, label, cards: [] };
      columns.push(currentColumn);
      continue;
    }

    if (currentColumn) {
      // Card with optional @{...} metadata.
      const { id, label, props } = parseNode(content);
      currentColumn.cards.push({ id, label, ...props });
    }
  }

  return { type: 'kanban', columns };
}

/**
 * Parse a node line into id/label and any trailing `@{ ... }` metadata props.
 * Accepts `id[Label]`, a bare `id`, or plain text.
 * @param {string} content - The trimmed line content.
 * @returns {{id: string, label: string, props: object}} Parsed node.
 */
function parseNode(content) {
  let props = {};
  // Pull off a trailing metadata block first.
  const metaM = content.match(/@\{([^}]*)\}\s*$/);
  if (metaM) { props = parseMeta(metaM[1]); content = content.slice(0, metaM.index).trim(); }

  let m;
  if ((m = content.match(/^(\w+)\s*\[\s*"?([^"\]]*?)"?\s*\]$/))) return { id: m[1], label: m[2].trim() || m[1], props };
  if ((m = content.match(/^(\w+)$/)))                            return { id: m[1], label: m[1], props };
  const label = content.replace(/^["']|["']$/g, '').trim();      // plain text
  return { id: `n${_anon++}`, label, props };
}

/**
 * Parse an `@{ key: value, ... }` metadata block into a props object. Values may
 * be quoted and contain spaces (e.g. `priority: 'Very High'`).
 * @param {string} body - The text between the braces.
 * @returns {object} Map of metadata key to value.
 */
function parseMeta(body) {
  const props = {};
  for (const m of body.matchAll(/(\w+)\s*:\s*("([^"]*)"|'([^']*)'|[^,]+)/g)) {
    const key = m[1].trim();
    const val = (m[3] ?? m[4] ?? m[2]).trim();
    props[key] = val;
  }
  return props;
}
