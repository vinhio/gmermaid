/**
 * State-diagram parser: turns Mermaid `stateDiagram` source text into a
 * StateAST of states (including pseudo-states and nested composites) and
 * transitions. Pure data, no DOM.
 */

// Module-level counter used to mint unique ids for each `[*]` final state.
// Reset at the start of every parse so ids are stable per document.
let finalCounter = 0;

/**
 * Parse Mermaid state diagram source into an AST.
 * @param {string} text - Raw Mermaid stateDiagram source.
 * @returns {{ type: 'state', states: Array<{id: string, name: string, kind: 'normal'|'initial'|'final'|'fork'|'join'|'choice'|'composite', children: Array<object>, note: string|null, x: number, y: number, w: number, h: number, transitions?: Array<object>}>, transitions: Array<{from: string, to: string, label: string}> }} The state AST.
 */
export function parseState(text) {
  finalCounter = 0;
  // Normalize: trim and drop blanks plus `%%` comments.
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('%%'));

  const stateMap = new Map(); // state id -> state object
  const transitions = [];

  // Seed the initial pseudo-state; removed later if never referenced.
  stateMap.set('__initial__', { id: '__initial__', name: '', kind: 'initial', children: [], note: null, x: 0, y: 0, w: 20, h: 20 });

  /**
   * Look up or create a top-level state by id.
   * @param {string} id - State identifier.
   * @param {string} [name] - Display name; defaults to the id.
   * @param {string} [kind] - State kind; defaults to 'normal'.
   * @returns {object} The state object.
   */
  function ensureState(id, name, kind) {
    if (!stateMap.has(id)) {
      stateMap.set(id, { id, name: name ?? id, kind: kind ?? 'normal', children: [], note: null, x: 0, y: 0, w: 0, h: 0 });
    }
    return stateMap.get(id);
  }

  parseBlock(lines.slice(1), stateMap, transitions, ensureState);

  // Remove __initial__ if not referenced
  const allIds = new Set([...transitions.map(t => t.from), ...transitions.map(t => t.to)]);
  if (!allIds.has('__initial__')) stateMap.delete('__initial__');

  return {
    type: 'state',
    states: [...stateMap.values()],
    transitions,
  };
}

/**
 * Parse a block of lines into a state map and transition list. Recurses for
 * composite `state X { ... }` blocks, accumulating into separate inner maps.
 * @param {string[]} lines - Lines of the block to parse.
 * @param {Map<string, object>} stateMap - Target map for states declared in this block.
 * @param {Array<object>} transitions - Target list for transitions in this block.
 * @param {(id: string, name?: string, kind?: string) => object} ensureState - State registrar for this scope.
 * @returns {void}
 */
function parseBlock(lines, stateMap, transitions, ensureState) {
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line === '}') break;

    // note right/left of State : text
    const noteM = line.match(/^note\s+(?:right|left)\s+of\s+(\w+)\s*:\s*(.+)/i);
    if (noteM) {
      const s = ensureState(noteM[1]);
      s.note = noteM[2].trim();
      i++; continue;
    }

    // state "Label" as ID
    const aliasM = line.match(/^state\s+"([^"]+)"\s+as\s+(\w+)/);
    if (aliasM) {
      ensureState(aliasM[2], aliasM[1]);
      i++; continue;
    }

    // state ID <<kind>>
    const pseudoM = line.match(/^state\s+(\w+)\s+<<(fork|join|choice)>>/i);
    if (pseudoM) {
      ensureState(pseudoM[1], pseudoM[1], pseudoM[2].toLowerCase());
      i++; continue;
    }

    // state ID { ... } (composite) — recurse over the brace-balanced body.
    const compositeM = line.match(/^state\s+(?:"([^"]+)"\s+as\s+)?(\w+)\s*\{/);
    if (compositeM) {
      const id   = compositeM[2];
      const name = compositeM[1] ?? id;
      const state = ensureState(id, name, 'composite');
      i++;
      // Collect inner lines, tracking nesting depth so nested composites are included.
      const innerLines = [];
      let depth = 1;
      while (i < lines.length && depth > 0) {
        if (/\{$/.test(lines[i])) depth++;
        if (lines[i] === '}') { depth--; if (depth === 0) { i++; break; } }
        if (depth > 0) innerLines.push(lines[i]);
        i++;
      }
      const innerMap = new Map();
      const innerTrans = [];
      // Inner scope gets its own registrar so child states stay local to the composite.
      function innerEnsure(id2, name2, kind2) {
        if (!innerMap.has(id2)) innerMap.set(id2, { id: id2, name: name2 ?? id2, kind: kind2 ?? 'normal', children: [], note: null, x: 0, y: 0, w: 0, h: 0 });
        return innerMap.get(id2);
      }
      parseBlock(innerLines, innerMap, innerTrans, innerEnsure);
      state.children = [...innerMap.values()];
      state.transitions = innerTrans;
      continue;
    }

    // Transition: A --> B : label   OR   [*] --> A   OR   A --> [*]
    // Endpoints may be bare ids or the `[*]` pseudo-state marker.
    const transM = line.match(/^(\[?\*?\w+\]?)\s*-->\s*(\[?\*?\w+\]?)(?:\s*:\s*(.+))?/);
    if (transM) {
      let from = transM[1], to = transM[2];
      const label = transM[3]?.trim() ?? '';

      // `[*]` as source = initial pseudo-state; as target = a fresh final state.
      if (from === '[*]') {
        from = '__initial__';
        if (!stateMap.has('__initial__')) {
          stateMap.set('__initial__', { id: '__initial__', name: '', kind: 'initial', children: [], note: null, x: 0, y: 0, w: 20, h: 20 });
        }
      }
      if (to === '[*]') {
        to = `__final_${finalCounter++}__`;
        stateMap.set(to, { id: to, name: '', kind: 'final', children: [], note: null, x: 0, y: 0, w: 28, h: 28 });
      }

      ensureState(from);
      ensureState(to);
      transitions.push({ from, to, label });
      i++; continue;
    }

    // Bare state declaration
    if (/^\w+$/.test(line)) { ensureState(line); }

    i++;
  }
}
