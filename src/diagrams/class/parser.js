/**
 * Class-diagram parser: turns Mermaid `classDiagram` source text into a
 * ClassAST of classes (with members), relationships, namespaces, and notes.
 * Pure data, no DOM. Aims to cover the documented Mermaid class syntax:
 * https://mermaid.js.org/syntax/classDiagram.html
 */

/** Relationship operator: an optional left head, a solid/dashed link, an optional right head. */
const REL_OP = '[-.<>|*o]{2,}';

/**
 * Parse Mermaid class diagram source into an AST.
 * @param {string} text - Raw Mermaid classDiagram source.
 * @returns {{
 *   type: 'class',
 *   direction: 'TB'|'BT'|'LR'|'RL',
 *   classes: Array<{id: string, name: string, generic: string|null, stereotype: string|null, namespace: string|null, attributes: Array<object>, x: number, y: number, w: number, h: number}>,
 *   relationships: Array<{from: string, to: string, type: string, dashed: boolean, startHead: string|null, endHead: string|null, fromLabel: string, toLabel: string, label: string}>,
 *   namespaces: Array<{name: string, classes: string[]}>,
 *   notes: Array<{forClass: string|null, text: string}>
 * }} The class AST. Each attribute is `{ visibility, name, type, isMethod, isStatic, isAbstract, params? }`.
 */
export function parseClass(text) {
  // Normalize: trim and drop blanks plus `%%` comments.
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('%%'));

  const classMap = new Map(); // class name -> class object
  const ctx = {
    classMap,
    relationships: [],
    notes: [],
    namespaces: [],
    meta: { direction: 'TB' },
    namespace: null, // current namespace while inside a `namespace { }` block
    /**
     * Look up or create a class by name, tagging it with the active namespace.
     * @param {string} name - Class name (without generic suffix).
     * @returns {object} The class object.
     */
    ensureClass(name) {
      if (!classMap.has(name)) {
        classMap.set(name, { id: name, name, generic: null, stereotype: null, namespace: ctx.namespace, attributes: [], x: 0, y: 0, w: 0, h: 0 });
      }
      const c = classMap.get(name);
      if (ctx.namespace && !c.namespace) c.namespace = ctx.namespace;
      return c;
    },
  };

  processBlock(lines.slice(1), ctx);

  return {
    type: 'class',
    direction: ctx.meta.direction,
    classes: [...classMap.values()],
    relationships: ctx.relationships,
    namespaces: ctx.namespaces,
    notes: ctx.notes,
  };
}

/**
 * Process a list of body lines (top-level or inside a namespace), populating the
 * shared context. Handles directives, class blocks, members, relationships,
 * notes, and nested namespaces.
 * @param {string[]} lines - Lines to process.
 * @param {object} ctx - Shared parse context (see parseClass).
 * @returns {void}
 */
function processBlock(lines, ctx) {
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === '}') { i++; continue; }

    // direction TB|BT|LR|RL
    const dirM = line.match(/^direction\s+(TB|BT|LR|RL)\b/i);
    if (dirM) { ctx.meta.direction = dirM[1].toUpperCase(); i++; continue; }

    // note for ClassName "text"  /  note "text"
    const noteForM = line.match(/^note\s+for\s+(\w+(?:~[^~]+~)?)\s+"(.+)"/i);
    if (noteForM) { ctx.notes.push({ forClass: baseName(noteForM[1]), text: unescapeText(noteForM[2]) }); i++; continue; }
    const noteM = line.match(/^note\s+"(.+)"/i);
    if (noteM) { ctx.notes.push({ forClass: null, text: unescapeText(noteM[1]) }); i++; continue; }

    // namespace Name { ... } — collect the brace-balanced body and recurse.
    const nsM = line.match(/^namespace\s+([\w.]+)(?:\s*\[[^\]]*\])?\s*\{?/i);
    if (nsM) {
      const before = ctx.classMap.size;
      const ids = new Set(ctx.classMap.keys());
      const { inner, nextIdx } = collectBraceBlock(lines, i);
      i = nextIdx;
      const prevNs = ctx.namespace;
      ctx.namespace = nsM[1];
      processBlock(inner, ctx);
      ctx.namespace = prevNs;
      // Record the classes that belong to this namespace (newly added since entry).
      const members = [...ctx.classMap.keys()].filter(k => !ids.has(k));
      if (members.length || ctx.classMap.size > before) ctx.namespaces.push({ name: nsM[1], classes: members });
      continue;
    }

    // class ClassName[~Generic~] [{ ... }]
    const classBlockM = line.match(/^class\s+(\w+)(?:~(.+?)~)?\s*(?:\{(.*))?$/);
    if (classBlockM) {
      const cls = ctx.ensureClass(classBlockM[1]);
      if (classBlockM[2]) cls.generic = classBlockM[2].trim();
      if (classBlockM[3] !== undefined) {
        const inline = classBlockM[3].trim();
        if (inline.endsWith('}')) {
          parseClassBody(cls, [inline.slice(0, -1).trim()]);
          i++; continue;
        }
        i++;
        const bodyLines = [];
        while (i < lines.length) {
          const l = lines[i];
          if (l === '}') { i++; break; }            // closing brace on its own line
          if (l.endsWith('}')) { bodyLines.push(l.slice(0, -1).trim()); i++; break; } // `member }`
          bodyLines.push(l); i++;
        }
        parseClassBody(cls, bodyLines);
        continue;
      }
      i++; continue;
    }

    // Standalone annotation: <<interface>> ClassName
    const annoM = line.match(/^<<(.+?)>>\s+(\w+)\s*$/);
    if (annoM) { ctx.ensureClass(annoM[2]).stereotype = annoM[1].trim(); i++; continue; }

    // Relationship line (with or without multiplicities/label).
    const rel = parseRelationship(line);
    if (rel) {
      ctx.ensureClass(rel.from);
      ctx.ensureClass(rel.to);
      ctx.relationships.push(rel);
      i++; continue;
    }

    // Member-per-line: ClassName : member
    const memberLineM = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (memberLineM) {
      parseClassBody(ctx.ensureClass(memberLineM[1]), [memberLineM[2].trim()]);
      i++; continue;
    }

    // Interaction/styling directives — recognized but not rendered; skip cleanly.
    if (/^(click|callback|link|style|classDef|cssClass)\b/i.test(line)) { i++; continue; }

    i++;
  }
}

/**
 * Collect the brace-balanced body of a block starting at `startIdx` (the line
 * holding the opening `{`), counting `{`/`}` across lines so nested class blocks
 * are balanced.
 * @param {string[]} lines - The full line list.
 * @param {number} startIdx - Index of the opening line.
 * @returns {{ inner: string[], nextIdx: number }} Inner lines and the index past the closing `}`.
 */
function collectBraceBlock(lines, startIdx) {
  const inner = [];
  let depth = 0;
  let i = startIdx;
  let started = false;
  for (; i < lines.length; i++) {
    const l = lines[i];
    const opens = (l.match(/\{/g) || []).length;
    const closes = (l.match(/\}/g) || []).length;
    if (started) inner.push(l);
    depth += opens - closes;
    if (!started && opens > 0) { started = true; inner.pop(); } // drop the opening line itself
    if (started && depth <= 0) { i++; break; }
  }
  // Remove a trailing lone '}' that closed the namespace.
  if (inner.length && inner[inner.length - 1] === '}') inner.pop();
  return { inner, nextIdx: i };
}

/**
 * Parse the member lines of a class body into the class's `attributes` list,
 * also picking up any stereotype declaration.
 * @param {object} cls - The class object to populate (mutated in place).
 * @param {string[]} lines - The body lines between the braces.
 * @returns {void}
 */
function parseClassBody(cls, lines) {
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Stereotype: <<interface>> etc.
    const stereoM = line.match(/^<<(.+)>>$/);
    if (stereoM) { cls.stereotype = stereoM[1].trim(); continue; }

    // Optional leading visibility symbol (+ - # ~); then the member text.
    const memberM = line.match(/^([+\-#~])?\s*(.+)$/);
    if (!memberM) continue;

    const visChar = memberM[1] || '';
    let rest = memberM[2].trim();

    const visMap = { '+': 'public', '-': 'private', '#': 'protected', '~': 'package' };
    const visibility = visMap[visChar] ?? 'package';

    // Trailing classifiers: `$` static and `*` abstract (either order).
    let isStatic = false, isAbstract = false;
    const clsfM = rest.match(/([*$]+)$/);
    if (clsfM) {
      isStatic   = clsfM[1].includes('$');
      isAbstract = clsfM[1].includes('*');
      rest = rest.slice(0, -clsfM[1].length).trim();
    }

    // Method: `name(params)` with an optional return type after the parens.
    const methodM = rest.match(/^(.+?)\s*\(\s*([^)]*)\s*\)\s*(.*)$/);
    if (methodM) {
      cls.attributes.push({
        visibility,
        name: methodM[1].trim(),
        params: methodM[2].trim(),
        type: methodM[3].trim() || 'void',
        isMethod: true,
        isStatic,
        isAbstract,
      });
      continue;
    }

    // Attribute: `type name` or just `name` (a lone token is the name).
    const parts = rest.split(/\s+/);
    if (parts.length >= 2) {
      cls.attributes.push({
        visibility, name: parts[parts.length - 1], type: parts.slice(0, -1).join(' '),
        isMethod: false, isStatic, isAbstract,
      });
    } else {
      cls.attributes.push({ visibility, name: parts[0], type: '', isMethod: false, isStatic, isAbstract });
    }
  }
}

/**
 * Parse a relationship line, with or without endpoint multiplicities and label.
 * @param {string} line - A source line.
 * @returns {object|null} The relationship, or null if the line is not one.
 */
function parseRelationship(line) {
  const END = '(\\w+(?:~[^~]+~)?)'; // endpoint, optionally carrying a ~Generic~
  // A ["card"] OP ["card"] B [: label] — cardinality is optional on EACH side.
  const m = line.match(new RegExp(`^${END}\\s*(?:"([^"]+)")?\\s*(${REL_OP})\\s*(?:"([^"]+)")?\\s*${END}(?:\\s*:\\s*(.+))?$`));
  if (!m) return null;
  return {
    from: baseName(m[1]), fromLabel: m[2] ?? '',
    ...parseOp(m[3]),
    toLabel: m[4] ?? '', to: baseName(m[5]),
    label: stripDir(m[6]),
  };
}

/**
 * Strip a trailing `~Generic~` suffix from a class reference to its base name.
 * @param {string} tok - Endpoint token (e.g. 'Container~T~').
 * @returns {string} The base class name (e.g. 'Container').
 */
function baseName(tok) {
  return tok.replace(/~[^~]*~$/, '');
}

/**
 * Decode a relationship operator into its end heads, link style, and a semantic
 * type. The left head sits at the `from` end, the right head at the `to` end.
 * @param {string} op - The operator token (e.g. '<|--', '*--', '..>', '<|--|>').
 * @returns {{ type: string, dashed: boolean, startHead: string|null, endHead: string|null }} Decoded relationship.
 */
function parseOp(op) {
  const dashed = op.includes('..');

  let startHead = null;
  if (op.startsWith('<|')) startHead = 'triangle';
  else if (op.startsWith('*')) startHead = 'diamondF';
  else if (op.startsWith('o')) startHead = 'diamondH';
  else if (op.startsWith('<')) startHead = 'arrow';

  let endHead = null;
  if (op.endsWith('|>')) endHead = 'triangle';
  else if (op.endsWith('*')) endHead = 'diamondF';
  else if (op.endsWith('o')) endHead = 'diamondH';
  else if (op.endsWith('>')) endHead = 'arrow';

  const head = startHead || endHead;
  let type;
  if (head === 'triangle')      type = dashed ? 'realization' : 'inheritance';
  else if (head === 'diamondF') type = 'composition';
  else if (head === 'diamondH') type = 'aggregation';
  else if (head === 'arrow')    type = dashed ? 'dependency' : 'association';
  else                          type = 'link'; // headless: solid or dashed link (style via `dashed`)

  return { type, dashed, startHead, endHead };
}

/**
 * Strip a leading/trailing label direction marker (`<`/`>`) and surrounding space.
 * @param {string} [label] - Raw relationship label.
 * @returns {string} Cleaned label text.
 */
function stripDir(label) {
  return (label ?? '').trim().replace(/^[<>]\s*/, '').replace(/\s*[<>]$/, '').trim();
}

/**
 * Decode `\n` escapes used in note text.
 * @param {string} s - Raw note text.
 * @returns {string} Text with literal newlines.
 */
function unescapeText(s) {
  return s.replace(/\\n/g, '\n');
}
