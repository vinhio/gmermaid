/**
 * ERD parser: turns Mermaid `erDiagram` source text into an ErdAST of
 * entities (tables with columns) and relationships. Pure data, no DOM.
 */

/**
 * Parse Mermaid ER diagram source into an AST.
 * @param {string} text - Raw Mermaid erDiagram source.
 * @returns {{ type: 'erd', entities: Array<{id: string, name: string, columns: Array<{type: string, name: string, pk: boolean, fk: boolean, uk: boolean, comment: string}>, x: number, y: number}>, relationships: Array<{from: string, to: string, label: string, fromCard: string, toCard: string}> }} The ERD AST.
 */
export function parseERD(text) {
  // Normalize: trim and drop blanks plus `%%` comments.
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('%%'));

  const entities     = new Map(); // entity name -> entity object
  const relationships = [];
  let currentEntity  = null;      // entity whose column block is being parsed

  /**
   * Look up or create an entity by name.
   * @param {string} name - Entity (table) name.
   * @returns {object} The entity object stored in the map.
   */
  function ensureEntity(name) {
    if (!entities.has(name)) entities.set(name, { id: name, name, columns: [], x: 0, y: 0 });
    return entities.get(name);
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // Entity block start: NAME {
    if (/^\w[\w-]*\s*\{/.test(line)) {
      const name = line.match(/^([\w-]+)/)[1];
      currentEntity = ensureEntity(name);
      continue;
    }

    // Entity block end
    if (line === '}') { currentEntity = null; continue; }

    // Column inside entity block
    if (currentEntity) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        currentEntity.columns.push({
          type:    parts[0],
          name:    parts[1],
          pk:      parts.includes('PK'),
          fk:      parts.includes('FK'),
          uk:      parts.includes('UK'),
          comment: extractComment(parts),
        });
      }
      continue;
    }

    // Relationship: ENTITY1 ||--o{ ENTITY2 : "label"
    // Captures: from name, crow's-foot notation (symbols around `--`), to name, optional quoted label.
    const rel = line.match(/^([\w-]+)\s+([|o{}\[\]]+--[|o{}\[\]]+)\s+([\w-]+)\s*:\s*"?([^"]*)"?/);
    if (rel) {
      const [, from, notation, to, label] = rel;
      ensureEntity(from);
      ensureEntity(to);
      relationships.push({
        from, to,
        label: label.trim(),
        ...parseCardinality(notation),
      });
    }
  }

  return { type: 'erd', entities: [...entities.values()], relationships };
}

/**
 * Extract a trailing quoted comment from a tokenized column definition.
 * @param {string[]} parts - Whitespace-split tokens of a column line.
 * @returns {string} The comment text with quotes stripped, or '' if none.
 */
function extractComment(parts) {
  const idx = parts.findIndex(p => p.startsWith('"'));
  if (idx < 0) return '';
  return parts.slice(idx).join(' ').replace(/"/g, '');
}

/**
 * Split a crow's-foot notation around `--` into source/target cardinalities.
 * @param {string} notation - e.g. '||--o{'.
 * @returns {{ fromCard: string, toCard: string }} Cardinality on each end.
 */
function parseCardinality(notation) {
  const [left, right] = notation.split('--');
  return {
    fromCard: symbolToCard(left  ?? ''),
    toCard:   symbolToCard(right ?? ''),
  };
}

/**
 * Map a crow's-foot symbol cluster to a cardinality keyword.
 * @param {string} sym - One side's symbols (e.g. '||', 'o{').
 * @returns {'many'|'zero-or-one'|'one'} The cardinality.
 */
function symbolToCard(sym) {
  if (sym.includes('{') || sym.includes('}')) return 'many';     // crow's foot = many
  if (sym.includes('o')) return 'zero-or-one';                   // circle = optional
  if (sym.split('|').length - 1 >= 2) return 'one';              // double bar = exactly one
  return 'one';
}
