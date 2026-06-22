/**
 * ERD parser: turns Mermaid `erDiagram` source text into an ErdAST of
 * entities (tables with columns) and relationships. Pure data, no DOM. Aims to
 * cover the documented Mermaid ER syntax:
 * https://mermaid.js.org/syntax/entityRelationshipDiagram.html
 */

/** Entity reference: an id, optionally followed by a `[Display Alias]`. */
const ENT = '([\\w-]+(?:\\[[^\\]]+\\])?)';

/**
 * Parse Mermaid ER diagram source into an AST.
 * @param {string} text - Raw Mermaid erDiagram source.
 * @returns {{
 *   type: 'erd',
 *   direction: 'TB'|'BT'|'LR'|'RL',
 *   entities: Array<{id: string, name: string, columns: Array<{type: string, name: string, keys: string[], pk: boolean, fk: boolean, uk: boolean, comment: string}>, style?: object, x: number, y: number}>,
 *   relationships: Array<{from: string, to: string, label: string, fromCard: string, toCard: string, dashed: boolean}>
 * }} The ERD AST.
 */
export function parseERD(text) {
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('%%'));

  const entities = new Map(); // entity id -> entity object
  const relationships = [];
  const classDefs = {};       // classDef name -> style object
  const classAssign = {};     // entity id -> class name
  let direction = 'TB';
  let current = null;         // entity whose column block is being parsed

  /**
   * Look up or create an entity by reference, updating its display name.
   * @param {{id: string, name: string}} ref - Parsed entity reference.
   * @returns {object} The entity object.
   */
  function ensureEntity(ref) {
    if (!entities.has(ref.id)) entities.set(ref.id, { id: ref.id, name: ref.name, columns: [], x: 0, y: 0 });
    const e = entities.get(ref.id);
    if (ref.name && ref.name !== ref.id) e.name = ref.name;
    return e;
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // Inside a column block: `}` closes it; everything else is a column.
    if (current) {
      if (line === '}') { current = null; continue; }
      const col = parseColumn(line);
      if (col) current.columns.push(col);
      continue;
    }

    // direction TB|BT|LR|RL
    const dirM = line.match(/^direction\s+(TB|TD|BT|LR|RL)\b/i);
    if (dirM) { direction = dirM[1].toUpperCase() === 'TD' ? 'TB' : dirM[1].toUpperCase(); continue; }

    // Styling directives.
    const cdM = line.match(/^classDef\s+(\w+)\s+(.+)/);
    if (cdM) { classDefs[cdM[1]] = parseStyleStr(cdM[2]); continue; }
    const clM = line.match(/^class\s+([\w,\s-]+?)\s+(\w+)\s*$/);
    if (clM) { clM[1].split(',').map(s => s.trim()).forEach(id => { classAssign[id] = clM[2]; }); continue; }
    const styM = line.match(/^style\s+([\w-]+)\s+(.+)/);
    if (styM) { (entities.get(styM[1]) || {}).style = parseStyleStr(styM[2]); continue; }
    if (/^(click|href)\b/i.test(line)) continue;

    // Entity block start: NAME { or NAME[Alias] {
    const blockM = line.match(new RegExp(`^${ENT}\\s*\\{$`));
    if (blockM) { current = ensureEntity(parseEntityRef(blockM[1])); continue; }

    // Relationship: ENTITY1 <card><--|..><card> ENTITY2 [: label]
    const relM = line.match(new RegExp(`^${ENT}\\s+([|}{o]+)(--|\\.\\.)([|}{o]+)\\s+${ENT}(?::::(\\w+))?(?:\\s*:\\s*(.+))?$`));
    if (relM) {
      const from = parseEntityRef(relM[1]);
      const to   = parseEntityRef(relM[5]);
      ensureEntity(from);
      ensureEntity(to);
      if (relM[6]) classAssign[to.id] = relM[6];
      relationships.push({
        from: from.id, to: to.id,
        label: stripQuotes(relM[7] ?? ''),
        fromCard: symbolToCard(relM[2]),
        toCard:   symbolToCard(relM[4]),
        dashed:   relM[3] === '..',
      });
      continue;
    }

    // Standalone entity: NAME or NAME[Alias] with optional `:::class`.
    const soM = line.match(new RegExp(`^${ENT}(?::::(\\w+))?$`));
    if (soM) { ensureEntity(parseEntityRef(soM[1])); if (soM[2]) classAssign[soM[1].replace(/\[.*$/, '')] = soM[2]; continue; }
  }

  // Apply class + inline styles.
  for (const [id, cls] of Object.entries(classAssign)) {
    const e = entities.get(id);
    if (e && classDefs[cls]) e.style = { ...classDefs[cls], ...e.style };
  }

  return { type: 'erd', direction, entities: [...entities.values()], relationships };
}

/**
 * Parse an entity reference `id` or `id[Display Alias]`.
 * @param {string} tok - The entity token.
 * @returns {{id: string, name: string}} Entity id and display name.
 */
function parseEntityRef(tok) {
  const m = tok.match(/^([\w-]+)(?:\[([^\]]+)\])?$/);
  if (!m) return { id: tok, name: tok };
  return { id: m[1], name: m[2] ?? m[1] };
}

/**
 * Parse a column line inside an entity block: `type name [PK|FK|UK[,...]] ["comment"]`.
 * @param {string} line - A column definition line.
 * @returns {{type: string, name: string, keys: string[], pk: boolean, fk: boolean, uk: boolean, comment: string}|null} The column, or null.
 */
function parseColumn(line) {
  // Pull off a trailing quoted comment first so it can contain spaces.
  let comment = '';
  const cm = line.match(/"([^"]*)"\s*$/);
  if (cm) { comment = cm[1]; line = line.slice(0, cm.index).trim(); }

  const parts = line.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;

  const type = parts[0];
  const name = parts[1];
  // Remaining tokens are key constraints, possibly comma-joined (e.g. `PK,FK`).
  const keys = parts.slice(2).flatMap(p => p.split(',')).map(k => k.trim().toUpperCase()).filter(Boolean);
  return {
    type, name, keys,
    pk: keys.includes('PK'),
    fk: keys.includes('FK'),
    uk: keys.includes('UK'),
    comment,
  };
}

/**
 * Map one side's crow's-foot symbols to a precise cardinality keyword.
 * @param {string} sym - One side's symbols (e.g. '||', '|o', 'o{', '}|').
 * @returns {'one'|'zero-or-one'|'one-or-more'|'zero-or-more'} The cardinality.
 */
function symbolToCard(sym) {
  const many = sym.includes('{') || sym.includes('}'); // crow's foot
  const zero = sym.includes('o');                      // circle = optional (min 0)
  if (many) return zero ? 'zero-or-more' : 'one-or-more';
  return zero ? 'zero-or-one' : 'one';
}

/**
 * Strip surrounding quotes and whitespace from a label.
 * @param {string} s - Raw label.
 * @returns {string} Cleaned label.
 */
function stripQuotes(s) {
  s = s.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s;
}

/**
 * Parse a `classDef`/`style` style string ("k1:v1,k2:v2") into an object.
 * @param {string} str - Comma-separated `key:value` declarations.
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
