/**
 * Class-diagram parser: turns Mermaid `classDiagram` source text into a
 * ClassAST of classes (with members), relationships, and notes. Pure data, no DOM.
 */

/**
 * Parse Mermaid class diagram source into an AST.
 * @param {string} text - Raw Mermaid classDiagram source.
 * @returns {{ type: 'class', classes: Array<{id: string, name: string, stereotype: string|null, attributes: Array<object>, x: number, y: number, w: number, h: number}>, relationships: Array<object>, notes: Array<{forClass: string, text: string}> }} The class AST. Each attribute is `{ visibility, name, type, isMethod, isStatic, isAbstract, params? }`; each relationship is `{ from, to, type, fromLabel, toLabel, label }`.
 */
export function parseClass(text) {
  // Normalize: trim and drop blanks plus `%%` comments.
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('%%'));

  const classMap = new Map(); // class name -> class object
  const relationships = [];
  const notes = [];

  /**
   * Look up or create a class by name.
   * @param {string} name - Class name.
   * @returns {object} The class object.
   */
  function ensureClass(name) {
    if (!classMap.has(name)) {
      classMap.set(name, { id: name, name, stereotype: null, attributes: [], x: 0, y: 0, w: 0, h: 0 });
    }
    return classMap.get(name);
  }

  let i = 1; // skip first line (classDiagram)
  while (i < lines.length) {
    const line = lines[i];

    // note for ClassName "text"
    const noteM = line.match(/^note\s+for\s+(\w+)\s+"(.+)"/i);
    if (noteM) { notes.push({ forClass: noteM[1], text: noteM[2] }); i++; continue; }

    // class ClassName { ... } (inline or block)
    const classBlockM = line.match(/^class\s+(\w+)(?:\s*\{(.*))?/);
    if (classBlockM) {
      const cls = ensureClass(classBlockM[1]);
      if (classBlockM[2] !== undefined) {
        // has opening brace
        const inline = classBlockM[2].trim();
        if (inline.endsWith('}')) {
          // single-line: class Foo { ... }
          parseClassBody(cls, [inline.slice(0, -1).trim()]);
          i++; continue;
        }
        // multi-line block
        i++;
        const bodyLines = [];
        while (i < lines.length && lines[i] !== '}') {
          bodyLines.push(lines[i]);
          i++;
        }
        i++; // skip '}'
        parseClassBody(cls, bodyLines);
        continue;
      }
      i++; continue;
    }

    // Relationship line with optional multiplicity and label
    // Patterns: A "1" --> "0..*" B : label  OR  A --> B : label  OR  A --> B
    const relM = parseRelationship(line);
    if (relM) {
      ensureClass(relM.from);
      ensureClass(relM.to);
      relationships.push(relM);
      i++; continue;
    }

    i++;
  }

  return { type: 'class', classes: [...classMap.values()], relationships, notes };
}

/**
 * Parse the member lines of a class body into the class's `attributes` list,
 * also picking up any stereotype declaration.
 * @param {object} cls - The class object to populate (mutated in place).
 * @param {string[]} lines - The body lines between the braces.
 * @returns {void}
 */
function parseClassBody(cls, lines) {
  for (const line of lines) {
    if (!line) continue;

    // Stereotype: <<interface>> etc.
    const stereoM = line.match(/^<<(.+)>>$/);
    if (stereoM) { cls.stereotype = stereoM[1].trim(); continue; }

    // Member line: optional leading visibility symbol (+ - # ~ $) then the rest.
    const memberM = line.match(/^([+\-#~$]?)(.+)/);
    if (!memberM) continue;

    const visChar = memberM[1] || '~';
    const rest = memberM[2].trim();

    const visMap = { '+': 'public', '-': 'private', '#': 'protected', '~': 'package', '$': 'static' };
    const visibility = visMap[visChar] ?? 'package';
    const isStatic = visChar === '$';

    // Method: `name(params)` with optional trailing `*` (abstract) and return type.
    const methodM = rest.match(/^(.+?)\s*\(\s*([^)]*)\s*\)\s*(\*?)\s*([^\s*]*)$/);
    if (methodM) {
      cls.attributes.push({
        visibility,
        name: methodM[1].trim(),
        params: methodM[2].trim(),
        type: methodM[4].trim() || 'void',
        isMethod: true,
        isStatic,
        isAbstract: methodM[3] === '*',
      });
      continue;
    }

    // Attribute: type name  OR  name type
    const parts = rest.split(/\s+/);
    if (parts.length >= 2) {
      // Mermaid allows both "type name" and "name type" — use heuristic: last token is name
      cls.attributes.push({
        visibility,
        name: parts[parts.length - 1],
        type: parts.slice(0, -1).join(' '),
        isMethod: false,
        isStatic,
        isAbstract: false,
      });
    } else {
      cls.attributes.push({ visibility, name: parts[0], type: '', isMethod: false, isStatic, isAbstract: false });
    }
  }
}

/**
 * Parse a relationship line, with or without endpoint multiplicities.
 * @param {string} line - A source line.
 * @returns {{ from: string, fromLabel: string, type: string, toLabel: string, to: string, label: string }|null} The relationship, or null if the line is not one.
 */
function parseRelationship(line) {
  // With multiplicity: A "1" OP "0..*" B : label
  // The OP cluster is 2+ relationship symbols (< | * . o ~ -).
  const multiM = line.match(/^(\w+)\s+"([^"]+)"\s+([<|*.o~]{2,}[-.<|*.o~]*)\s+"([^"]+)"\s+(\w+)(?:\s*:\s*(.+))?/);
  if (multiM) {
    return {
      from: multiM[1], fromLabel: multiM[2],
      ...opToType(multiM[3]),
      toLabel: multiM[4], to: multiM[5],
      label: multiM[6]?.trim() ?? '',
    };
  }

  // Standard: A OP B : label
  const stdM = line.match(/^(\w+)\s+([<|*.o~]{2,}[-.<|*.o~]*)\s+(\w+)(?:\s*:\s*(.+))?/);
  if (stdM) {
    return {
      from: stdM[1], fromLabel: '',
      ...opToType(stdM[2]),
      toLabel: '', to: stdM[3],
      label: stdM[4]?.trim() ?? '',
    };
  }

  return null;
}

/**
 * Classify a relationship operator into a UML relationship type.
 * Order matters: more specific symbol combinations are tested first.
 * @param {string} op - The operator cluster (e.g. '<|--', '*--', '..>').
 * @returns {{ type: 'inheritance'|'composition'|'aggregation'|'realization'|'dependency'|'association'|'link' }} The classified type.
 */
function opToType(op) {
  if (/\<\|/.test(op) || /\|\>/.test(op)) return { type: 'inheritance' };       // triangle head
  if (/\*/.test(op)) return { type: 'composition' };                            // filled diamond
  if (/o/.test(op)) return { type: 'aggregation' };                             // hollow diamond
  if (/\.\.>|<\.\./.test(op) && /\|/.test(op)) return { type: 'realization' };  // dashed + triangle
  if (/\.\.>|<\.\./.test(op)) return { type: 'dependency' };                    // dashed arrow
  if (/-->|<--/.test(op)) return { type: 'association' };                       // solid arrow
  return { type: 'link' };                                                      // plain line
}
