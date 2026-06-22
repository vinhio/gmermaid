/**
 * State-diagram parser: turns Mermaid `stateDiagram`/`stateDiagram-v2` source
 * into a StateAST of states (including pseudo-states, nested composites and
 * parallel regions) and transitions. Pure data, no DOM. Aims to cover the
 * documented Mermaid state syntax:
 * https://mermaid.js.org/syntax/stateDiagram.html
 */

// Module-level counter used to mint unique ids for each `[*]` final state.
// Reset at the start of every parse so ids are stable per document.
let finalCounter = 0;

/**
 * Parse Mermaid state diagram source into an AST.
 * @param {string} text - Raw Mermaid stateDiagram source.
 * @returns {{
 *   type: 'state',
 *   direction: 'TB'|'BT'|'LR'|'RL',
 *   states: Array<{id: string, name: string, kind: string, children: Array<object>, regions?: string[][], note: string|null, noteSide?: string, style?: object, x: number, y: number, w: number, h: number, transitions?: Array<object>}>,
 *   transitions: Array<{from: string, to: string, label: string}>
 * }} The state AST.
 */
export function parseState(text) {
  finalCounter = 0;
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('%%'));

  const stateMap = new Map(); // top-level state id -> state object
  const transitions = [];
  const classDefs = {};        // classDef name -> style object
  const classAssign = {};      // state id -> class name
  const meta = { direction: 'TB' };

  const mkState = (id, name, kind) => ({ id, name: name ?? id, kind: kind ?? 'normal', children: [], note: null, x: 0, y: 0, w: 0, h: 0 });

  /**
   * Look up or create a top-level state by id.
   * @param {string} id - State identifier.
   * @param {string} [name] - Display name; defaults to the id.
   * @param {string} [kind] - State kind; defaults to 'normal'.
   * @returns {object} The state object.
   */
  function ensureState(id, name, kind) {
    if (!stateMap.has(id)) stateMap.set(id, mkState(id, name, kind));
    const s = stateMap.get(id);
    if (name && name !== id) s.name = name;
    if (kind && kind !== 'normal') s.kind = kind;
    return s;
  }

  parseBlock(lines.slice(1), stateMap, transitions, ensureState, { classDefs, classAssign, meta, mkState });

  // Drop the seed initial state if it was never used as a transition source.
  if (![...transitions].some(t => t.from === '__initial__')) stateMap.delete('__initial__');

  const ast = { type: 'state', direction: meta.direction, states: [...stateMap.values()], transitions };
  applyStyles(ast.states, classDefs, classAssign);
  return ast;
}

/**
 * Parse a block of lines into a state map and transition list. Recurses for
 * composite `state X { ... }` blocks (with `--` parallel-region separators).
 * @param {string[]} lines - Lines of the block.
 * @param {Map<string, object>} stateMap - Target map for states in this block.
 * @param {Array<object>} transitions - Target transition list for this block.
 * @param {(id: string, name?: string, kind?: string) => object} ensureState - State registrar for this scope.
 * @param {{classDefs: object, classAssign: object, meta: object, mkState: Function}} ctx - Shared parse context.
 * @returns {void}
 */
function parseBlock(lines, stateMap, transitions, ensureState, ctx) {
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === '}') break;

    // direction TB|BT|LR|RL
    const dirM = line.match(/^direction\s+(TB|TD|BT|LR|RL)\b/i);
    if (dirM) { ctx.meta.direction = dirM[1].toUpperCase() === 'TD' ? 'TB' : dirM[1].toUpperCase(); i++; continue; }

    // Single-line note: note left/right of X : text
    const noteOne = line.match(/^note\s+(left|right)\s+of\s+(\w+)\s*:\s*(.+)/i);
    if (noteOne) { const s = ensureState(noteOne[2]); s.note = noteOne[3].trim(); s.noteSide = noteOne[1].toLowerCase(); i++; continue; }

    // Multi-line note: note left/right of X \n ... \n end note
    const noteMulti = line.match(/^note\s+(left|right)\s+of\s+(\w+)\s*$/i);
    if (noteMulti) {
      i++;
      const body = [];
      while (i < lines.length && !/^end\s*note$/i.test(lines[i])) { body.push(lines[i]); i++; }
      i++; // skip `end note`
      const s = ensureState(noteMulti[2]); s.note = body.join('\n'); s.noteSide = noteMulti[1].toLowerCase();
      continue;
    }

    // Composite: state [ "Label" as ] ID { ... }  (checked before plain `state` forms)
    const compositeM = line.match(/^state\s+(?:"([^"]+)"\s+as\s+)?(\w+)\s*\{$/);
    if (compositeM) {
      const id = compositeM[2];
      const state = ensureState(id, compositeM[1] ?? id, 'composite');
      i++;
      const inner = [];
      let depth = 1;
      while (i < lines.length && depth > 0) {
        if (/\{$/.test(lines[i])) depth++;
        if (lines[i] === '}') { depth--; if (depth === 0) { i++; break; } }
        if (depth > 0) inner.push(lines[i]);
        i++;
      }
      parseComposite(state, inner, transitions, ctx);
      continue;
    }

    // state "Label" as ID
    const aliasM = line.match(/^state\s+"([^"]+)"\s+as\s+(\w+)\s*$/);
    if (aliasM) { ensureState(aliasM[2], aliasM[1]); i++; continue; }

    // state ID <<fork|join|choice>>
    const pseudoM = line.match(/^state\s+(\w+)\s+<<(fork|join|choice)>>/i);
    if (pseudoM) { ensureState(pseudoM[1], pseudoM[1], pseudoM[2].toLowerCase()); i++; continue; }

    // state ID  (bare declaration via the `state` keyword)
    const stateDecl = line.match(/^state\s+(\w+)\s*$/);
    if (stateDecl) { ensureState(stateDecl[1]); i++; continue; }

    // classDef name style
    const cdM = line.match(/^classDef\s+(\w+)\s+(.+)/);
    if (cdM) { ctx.classDefs[cdM[1]] = parseStyleStr(cdM[2]); i++; continue; }

    // class A, B styleName
    const clM = line.match(/^class\s+([\w,\s]+?)\s+(\w+)\s*$/);
    if (clM) { clM[1].split(',').map(s => s.trim()).forEach(id => { ctx.classAssign[id] = clM[2]; }); i++; continue; }

    // ID:::styleName
    const tripleM = line.match(/^(\w+):::(\w+)\s*$/);
    if (tripleM) { ensureState(tripleM[1]); ctx.classAssign[tripleM[1]] = tripleM[2]; i++; continue; }

    // Transition: A --> B [ : label ], endpoints bare ids or `[*]`.
    const transM = line.match(/^(\[\*\]|\w+)(?::::(\w+))?\s*-->\s*(\[\*\]|\w+)(?::::(\w+))?(?:\s*:\s*(.+))?$/);
    if (transM) {
      let from = transM[1], to = transM[3];
      if (transM[2]) ctx.classAssign[from] = transM[2];
      if (transM[4]) ctx.classAssign[to]   = transM[4];

      if (from === '[*]') {
        from = '__initial__';
        if (!stateMap.has('__initial__')) stateMap.set('__initial__', { ...ctx.mkState('__initial__', '', 'initial'), w: 20, h: 20 });
      } else ensureState(from);
      if (to === '[*]') {
        to = `__final_${finalCounter++}__`;
        stateMap.set(to, { ...ctx.mkState(to, '', 'final'), w: 28, h: 28 });
      } else ensureState(to);

      transitions.push({ from, to, label: transM[5]?.trim() ?? '' });
      i++; continue;
    }

    // State description: ID : text  (sets the state's display name)
    const descM = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (descM) { ensureState(descM[1], descM[2].trim()); i++; continue; }

    // Bare state declaration
    if (/^\w+$/.test(line)) ensureState(line);

    i++;
  }
}

/**
 * Parse a composite state's body, splitting top-level `--` separators into
 * parallel regions. Populates `state.children`, `state.transitions`, and
 * `state.regions` (a list of child-id groups, one per region).
 * @param {object} state - The composite state to populate.
 * @param {string[]} inner - Inner body lines (between the braces).
 * @param {Array<object>} _outerTrans - Unused; inner transitions stay local.
 * @param {object} ctx - Shared parse context.
 * @returns {void}
 */
function parseComposite(state, inner, _outerTrans, ctx) {
  const segments = splitRegions(inner);
  const innerMap = new Map();
  const innerTrans = [];
  const regions = [];
  // Composite-local meta so a `direction` inside the composite doesn't leak out.
  const localCtx = { ...ctx, meta: { direction: ctx.meta.direction } };

  function innerEnsure(id, name, kind) {
    if (!innerMap.has(id)) innerMap.set(id, ctx.mkState(id, name, kind));
    const s = innerMap.get(id);
    if (name && name !== id) s.name = name;
    if (kind && kind !== 'normal') s.kind = kind;
    return s;
  }

  for (const seg of segments) {
    const before = new Set(innerMap.keys());
    parseBlock(seg, innerMap, innerTrans, innerEnsure, localCtx);
    regions.push([...innerMap.keys()].filter(id => !before.has(id)));
  }
  state.direction = localCtx.meta.direction;

  state.children = [...innerMap.values()];
  state.transitions = innerTrans;
  if (regions.length > 1) state.regions = regions;
}

/**
 * Split composite-body lines into parallel regions on top-level `--` separators
 * (those not nested inside a deeper `state { ... }`).
 * @param {string[]} lines - The composite body lines.
 * @returns {string[][]} One group of lines per region (always at least one).
 */
function splitRegions(lines) {
  const segments = [[]];
  let depth = 0;
  for (const l of lines) {
    if (depth === 0 && l === '--') { segments.push([]); continue; }
    if (/\{$/.test(l)) depth++;
    else if (l === '}') depth = Math.max(0, depth - 1);
    segments[segments.length - 1].push(l);
  }
  return segments;
}

/**
 * Apply classDef styles to states (recursively into composites) by class
 * assignment.
 * @param {Array<object>} states - States to style.
 * @param {object} classDefs - classDef name -> style object.
 * @param {object} classAssign - state id -> class name.
 * @returns {void}
 */
function applyStyles(states, classDefs, classAssign) {
  for (const s of states) {
    const cls = classAssign[s.id];
    if (cls && classDefs[cls]) s.style = { ...classDefs[cls] };
    if (s.children?.length) applyStyles(s.children, classDefs, classAssign);
  }
}

/**
 * Parse a `classDef` style string ("k1:v1,k2:v2") into an object.
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
