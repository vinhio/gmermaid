/**
 * Sequence parser: turns Mermaid `sequenceDiagram` source text into a
 * SequenceAST of participants and an ordered, possibly-nested list of steps
 * (messages, notes, activations, and grouping blocks). Pure data, no DOM.
 */

/**
 * Parse Mermaid sequence diagram source into an AST.
 * @param {string} text - Raw Mermaid sequenceDiagram source.
 * @returns {{ type: 'sequence', participants: Array<{id: string, name: string, type: 'participant'|'actor'}>, steps: Array<object> }} The sequence AST. Each step has a `kind` of 'message' | 'note' | 'activate' | 'deactivate' | 'group'; group steps nest further steps in `branches`.
 */
export function parseSequence(text) {
  // Normalize: trim and drop blanks plus `%%` comments.
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('%%'));

  const participantMap = new Map(); // id -> participant (preserves first-seen order)
  const participants = [];

  /**
   * Register or update a participant by id, tracking declaration order.
   * @param {string} id - Participant identifier.
   * @param {string} [name] - Display name (from `as` alias); defaults to id.
   * @param {'participant'|'actor'} [type] - Declared type; defaults to 'participant'.
   * @returns {object} The participant object.
   */
  function getOrAdd(id, name, type) {
    if (!participantMap.has(id)) {
      const p = { id, name: name ?? id, type: type ?? 'participant' };
      participantMap.set(id, p);
      participants.push(p);
    } else if (name) {
      const p = participantMap.get(id);
      p.name = name;
      if (type) p.type = type;
    }
    return participantMap.get(id);
  }

  const steps = parseBlock(lines.slice(1), getOrAdd);
  return { type: 'sequence', participants, steps };
}

/**
 * Parse a (possibly nested) block of lines into an ordered step list.
 * Recurses for group blocks (alt/loop/opt/par/critical/break) and stops at `end`.
 * @param {string[]} lines - Lines of the block to parse.
 * @param {(id: string, name?: string, type?: string) => object} getOrAdd - Participant registrar shared across recursion.
 * @returns {Array<object>} The ordered list of step objects.
 */
function parseBlock(lines, getOrAdd) {
  const steps = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line === 'end') break;

    // participant / actor declaration
    const partM = line.match(/^(participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/i);
    if (partM) {
      getOrAdd(partM[2], partM[3]?.trim(), partM[1].toLowerCase());
      i++; continue;
    }

    // activate / deactivate
    const actM = line.match(/^(de)?activate\s+(\S+)/i);
    if (actM) {
      steps.push({ kind: actM[1] ? 'deactivate' : 'activate', participant: actM[2] });
      i++; continue;
    }

    // note left of / right of / over
    const noteM = line.match(/^note\s+(left of|right of|over)\s+([\w,\s]+?)\s*:\s*(.+)/i);
    if (noteM) {
      const pos = noteM[1].toLowerCase().replace(/ of$/, '');
      const ids = noteM[2].split(',').map(s => s.trim()).filter(Boolean);
      ids.forEach(id => getOrAdd(id));
      steps.push({ kind: 'note', position: pos, participants: ids, text: noteM[3].trim() });
      i++; continue;
    }

    // alt (multi-branch: split on `else` into branches)
    const altM = line.match(/^alt\b\s*(.*)/i);
    if (altM) {
      const { inner, nextIdx } = extractBlock(lines, i + 1);
      i = nextIdx;
      const rawBranches = splitElse(inner);
      const branches = rawBranches.map((b, bi) => ({
        label: bi === 0 ? altM[1].trim() : b.elseLabel,
        steps: parseBlock(b.lines, getOrAdd),
      }));
      steps.push({ kind: 'group', type: 'alt', label: altM[1].trim(), branches });
      continue;
    }

    // loop / opt / par / critical / break (single-branch)
    const groupM = line.match(/^(loop|opt|par|critical|break)\b\s*(.*)/i);
    if (groupM) {
      const { inner, nextIdx } = extractBlock(lines, i + 1);
      i = nextIdx;
      const innerSteps = parseBlock(inner, getOrAdd);
      const label = groupM[2].trim();
      steps.push({ kind: 'group', type: groupM[1].toLowerCase(), label, branches: [{ label, steps: innerSteps }] });
      continue;
    }

    // message: A->>B: text — arrow operator distinguishes solid/dashed and head style.
    const msgM = line.match(/^(\S+)\s*(-->>|-->|->>|->|--x|-x|--\)|-\))\s*(\S+)\s*:\s*(.+)/);
    if (msgM) {
      const [, from, arrow, to, text] = msgM;
      getOrAdd(from); getOrAdd(to);
      steps.push({ kind: 'message', from, to, text: text.trim(), arrow });
      i++; continue;
    }

    i++;
  }

  return steps;
}

/**
 * Collect the lines inside a group block, balancing nested blocks until the
 * matching `end`. The opening keyword line is assumed already consumed.
 * @param {string[]} lines - The full line list being scanned.
 * @param {number} startIdx - Index of the first line inside the block.
 * @returns {{ inner: string[], nextIdx: number }} The inner lines and the index just past the matching `end`.
 */
function extractBlock(lines, startIdx) {
  const inner = [];
  let depth = 1; // depth of unmatched block openers
  let i = startIdx;
  while (i < lines.length && depth > 0) {
    const l = lines[i];
    if (/^(loop|alt|opt|par|critical|break)\b/i.test(l)) depth++;
    if (l === 'end') { depth--; if (depth === 0) { i++; break; } }
    if (depth > 0) inner.push(l);
    i++;
  }
  return { inner, nextIdx: i };
}

/**
 * Split an alt block's inner lines into branches on top-level `else` keywords.
 * @param {string[]} lines - Inner lines of an alt block.
 * @returns {Array<{ elseLabel: string, lines: string[] }>} Branches; the first has an empty elseLabel.
 */
function splitElse(lines) {
  const branches = [{ elseLabel: '', lines: [] }];
  for (const l of lines) {
    const elseM = l.match(/^else\b\s*(.*)/i);
    if (elseM) branches.push({ elseLabel: elseM[1].trim(), lines: [] });
    else branches[branches.length - 1].lines.push(l);
  }
  return branches;
}
