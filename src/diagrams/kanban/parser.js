/**
 * @file Parses Mermaid `kanban` syntax into a KanbanAST.
 *
 * Structure is indentation-based: lines at the first detected indent are column
 * headers; deeper-indented lines are cards within the current column. Cards may
 * carry an optional `[Label]` and an `@{ key: value, ... }` metadata block
 * (e.g. ticket, priority). Parsing never touches the DOM.
 */

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
  const lines = text.split('\n');
  const columns = [];
  let currentColumn = null;
  let colIndent = null; // indent width of first column line (auto-detected)

  for (const line of lines) {
    const l = line.trimEnd();
    if (!l.trim() || l.trim().startsWith('%%') || /^kanban\b/i.test(l.trim())) continue;

    const indent  = l.match(/^\s*/)[0].length;
    const content = l.trim();

    // Auto-detect column indent from the first non-kanban line
    if (colIndent === null) colIndent = indent;

    if (indent <= colIndent) {
      // Column header: `id` or `id[Label]`; falls back to raw content as label.
      const colM = content.match(/^(\w+)(?:\["?([^"\]]*)"?\])?$/);
      const label = colM ? (colM[2] ?? colM[1]) : content.replace(/^["']|["']$/g, '');
      currentColumn = { id: colM?.[1] ?? `col${columns.length}`, label, cards: [] };
      columns.push(currentColumn);
      continue;
    }

    if (currentColumn) {
      // Card: id[Label]@{ticket: ..., priority: ...}  or  id[Label]
      const cardM = content.match(/^(\w+)(?:\["?([^"\]]*)"?\])?(?:@\{([^}]*)\})?$/);
      if (!cardM) continue;
      const [, id, label, meta] = cardM;
      const props = {};
      if (meta) {
        // Parse `key: value` pairs from the @{...} block into card props.
        for (const m of meta.matchAll(/([\w]+):\s*["']?([^,"']+)["']?/g)) {
          props[m[1].trim()] = m[2].trim();
        }
      }
      currentColumn.cards.push({ id: id ?? `card${columns.length}_${currentColumn.cards.length}`, label: label ?? id ?? content, ...props });
    }
  }

  return { type: 'kanban', columns };
}
