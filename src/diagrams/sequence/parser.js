/**
 * Sequence parser: turns Mermaid `sequenceDiagram` source text into a
 * SequenceAST of participants and an ordered, possibly-nested list of steps
 * (messages, notes, activations, lifecycle, highlights, and grouping blocks).
 * Pure data, no DOM. Aims to cover the documented Mermaid sequence syntax:
 * https://mermaid.js.org/syntax/sequenceDiagram.html
 */

/** Message arrow tokens, longest-first so the regex never matches a prefix. */
const ARROWS = '<<-->>|<<->>|-->>|-->|->>|->|--x|-x|--\\)|-\\)';

/**
 * Parse Mermaid sequence diagram source into an AST.
 * @param {string} text - Raw Mermaid sequenceDiagram source.
 * @returns {{
 *   type: 'sequence',
 *   participants: Array<{id: string, name: string, type: 'participant'|'actor'}>,
 *   boxes: Array<{label: string, color: string|null, participants: string[]}>,
 *   autonumber: false | {start: number, step: number},
 *   steps: Array<object>
 * }} The sequence AST. Each step has a `kind` of 'message' | 'note' | 'activate'
 *   | 'deactivate' | 'destroy' | 'rect' | 'group'; `group`/`rect` steps nest
 *   further steps (groups in `branches`, rect in `steps`).
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

  // Shared parse context threaded through nested blocks.
  const ctx = { getOrAdd, boxes: [], meta: { autonumber: false } };
  const steps = parseBlock(lines.slice(1), ctx);
  return {
    type: 'sequence',
    participants,
    boxes: ctx.boxes,
    autonumber: ctx.meta.autonumber,
    steps,
  };
}

/**
 * Parse a (possibly nested) block of lines into an ordered step list.
 * Recurses for grouping blocks and stops at a balancing `end`.
 * @param {string[]} lines - Lines of the block to parse.
 * @param {{getOrAdd: Function, boxes: Array, meta: object}} ctx - Shared parse context.
 * @returns {Array<object>} The ordered list of step objects.
 */
function parseBlock(lines, ctx) {
  const steps = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line === 'end') break;

    // autonumber [start [step]]
    const autoM = line.match(/^autonumber\b\s*(\d+)?\s*(\d+)?/i);
    if (autoM) {
      ctx.meta.autonumber = { start: autoM[1] ? +autoM[1] : 1, step: autoM[2] ? +autoM[2] : 1 };
      i++; continue;
    }

    // box [color] [description] ... end — groups participants in a colored frame.
    const boxM = line.match(/^box\b\s*(.*)/i);
    if (boxM) {
      const { inner, nextIdx } = extractBlock(lines, i + 1);
      i = nextIdx;
      const { color, label } = parseBoxHeader(boxM[1].trim());
      const ids = [];
      // A box body holds participant/actor declarations; register and collect them.
      for (const bl of inner) {
        const pm = bl.match(/^(participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/i);
        if (pm) { ctx.getOrAdd(pm[2], pm[3]?.trim(), pm[1].toLowerCase()); ids.push(pm[2]); }
      }
      ctx.boxes.push({ label, color, participants: ids });
      continue;
    }

    // create participant|actor X [as Y] — register a participant introduced mid-flow.
    const createM = line.match(/^create\s+(participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/i);
    if (createM) {
      ctx.getOrAdd(createM[2], createM[3]?.trim(), createM[1].toLowerCase());
      i++; continue;
    }

    // destroy X — end a participant's lifeline at this point.
    const destroyM = line.match(/^destroy\s+(\S+)/i);
    if (destroyM) {
      steps.push({ kind: 'destroy', participant: destroyM[1] });
      i++; continue;
    }

    // participant / actor declaration
    const partM = line.match(/^(participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/i);
    if (partM) {
      ctx.getOrAdd(partM[2], partM[3]?.trim(), partM[1].toLowerCase());
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
      ids.forEach(id => ctx.getOrAdd(id));
      steps.push({ kind: 'note', position: pos, participants: ids, text: noteM[3].trim() });
      i++; continue;
    }

    // rect rgb(...) / rgba(...) — background highlight around its inner steps.
    const rectM = line.match(/^rect\b\s*(.*)/i);
    if (rectM) {
      const { inner, nextIdx } = extractBlock(lines, i + 1);
      i = nextIdx;
      steps.push({ kind: 'rect', color: rectM[1].trim() || 'rgba(255,255,255,0.05)', steps: parseBlock(inner, ctx) });
      continue;
    }

    // Multi-branch blocks: alt/else, par/and, critical/option.
    const multiM = line.match(/^(alt|par|critical)\b\s*(.*)/i);
    if (multiM) {
      const type = multiM[1].toLowerCase();
      const sep = { alt: 'else', par: 'and', critical: 'option' }[type];
      const { inner, nextIdx } = extractBlock(lines, i + 1);
      i = nextIdx;
      const raw = splitOn(inner, sep);
      const branches = raw.map((b, bi) => ({
        label: bi === 0 ? multiM[2].trim() : b.label,
        steps: parseBlock(b.lines, ctx),
      }));
      steps.push({ kind: 'group', type, label: multiM[2].trim(), branches });
      continue;
    }

    // Single-branch blocks: loop / opt / break.
    const groupM = line.match(/^(loop|opt|break)\b\s*(.*)/i);
    if (groupM) {
      const { inner, nextIdx } = extractBlock(lines, i + 1);
      i = nextIdx;
      const label = groupM[2].trim();
      steps.push({ kind: 'group', type: groupM[1].toLowerCase(), label, branches: [{ label, steps: parseBlock(inner, ctx) }] });
      continue;
    }

    // Actor links/menus — interactive only; skip so they don't break parsing.
    if (/^(link|links|menu)\b/i.test(line)) { i++; continue; }

    // message: A->>B: text — arrow distinguishes solid/dashed/head; an optional
    // `+`/`-` between arrow and target is Mermaid's activation shorthand
    // (`+` activates the target, `-` deactivates the source).
    const msgM = line.match(new RegExp(`^(\\S+?)\\s*(${ARROWS})\\s*([+-]?)\\s*(\\S+)\\s*:\\s*(.+)`));
    if (msgM) {
      const [, from, arrow, activation, to, text] = msgM;
      ctx.getOrAdd(from); ctx.getOrAdd(to);
      steps.push({ kind: 'message', from, to, text: text.trim(), arrow });
      // Emit the (de)activation after the message so the bar aligns to this row.
      if (activation === '+')      steps.push({ kind: 'activate',   participant: to });
      else if (activation === '-') steps.push({ kind: 'deactivate', participant: from });
      i++; continue;
    }

    i++;
  }

  return steps;
}

/**
 * Collect the lines inside a block, balancing nested blocks until the matching
 * `end`. The opening keyword line is assumed already consumed.
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
    if (/^(loop|alt|opt|par|critical|break|rect|box)\b/i.test(l)) depth++;
    if (l === 'end') { depth--; if (depth === 0) { i++; break; } }
    if (depth > 0) inner.push(l);
    i++;
  }
  return { inner, nextIdx: i };
}

/**
 * Split a block's inner lines into branches on a top-level separator keyword
 * (`else` for alt, `and` for par, `option` for critical).
 * @param {string[]} lines - Inner lines of a multi-branch block.
 * @param {string} keyword - The separator keyword.
 * @returns {Array<{ label: string, lines: string[] }>} Branches; the first has an empty label.
 */
function splitOn(lines, keyword) {
  const re = new RegExp(`^${keyword}\\b\\s*(.*)`, 'i');
  const branches = [{ label: '', lines: [] }];
  for (const l of lines) {
    const m = l.match(re);
    if (m) branches.push({ label: m[1].trim(), lines: [] });
    else branches[branches.length - 1].lines.push(l);
  }
  return branches;
}

/**
 * Split a `box` header into an optional leading color and the remaining label.
 * Recognizes `rgb()/rgba()`, hex, `transparent`, and common color names; if no
 * color is found the whole header is treated as the label.
 * @param {string} s - The text following the `box` keyword.
 * @returns {{ color: string|null, label: string }} Parsed box header.
 */
function parseBoxHeader(s) {
  let m = s.match(/^(rgba?\([^)]*\))\s*(.*)$/i);
  if (m) return { color: m[1], label: m[2].trim() };
  m = s.match(/^(#[0-9a-fA-F]{3,8})\s*(.*)$/);
  if (m) return { color: m[1], label: m[2].trim() };
  m = s.match(/^(transparent|aqua|red|green|blue|yellow|orange|purple|pink|gray|grey|cyan|magenta|lime|teal|navy|olive|maroon|silver|gold|white|black)\b\s*(.*)$/i);
  if (m) return { color: m[1].toLowerCase(), label: m[2].trim() };
  return { color: null, label: s };
}
