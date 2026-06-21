/**
 * Parses Mermaid `requirementDiagram` syntax into a RequirementAST.
 * @module diagrams/requirement/parser
 */

/**
 * Parses Mermaid requirement-diagram text into an AST. Does not touch the DOM.
 *
 * Lines are consumed with a shared index `i` because requirement/element bodies
 * are multi-line brace blocks read via {@link readBlock}. Recognises requirement
 * blocks (`...requirement`/`...constraint <id> { ... }`), element blocks
 * (`element <id> { ... }`), and relationship lines (`from - rel -> to`).
 *
 * @param {string} text - Raw Mermaid requirementDiagram source.
 * @returns {{
 *   type: 'requirement',
 *   requirements: Array<{ kind: string, id: string, [prop: string]: string }>,
 *   elements: Array<{ id: string, [prop: string]: string }>,
 *   rels: Array<{ from: string, rel: string, to: string }>
 * }} RequirementAST. Block `key: value` pairs (e.g. text, risk, type) are spread onto each node.
 */
export function parseRequirement(text) {
  const lines = text.split('\n');
  const requirements = [], elements = [], rels = [];
  let i = 0; // Shared cursor advanced by both the main loop and readBlock.

  /**
   * Consumes lines from the current cursor until a closing `}`, collecting the
   * `key: value` properties of a requirement/element body.
   * @returns {Object<string, string>} Map of property name to trimmed value.
   */
  function readBlock() {
    const props = {};
    while (i < lines.length) {
      const l = lines[i].trim();
      i++;
      if (l === '}') return props;
      const m = l.match(/^(\w+):\s*(.+)$/);
      if (m) props[m[1]] = m[2].trim();
    }
    return props;
  }

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || line.startsWith('%%') || /^requirementDiagram\b/i.test(line)) { i++; continue; }

    // Requirement/constraint block opener; body props are read from the next lines.
    const reqM = line.match(/^(\w*[Rr]equirement|\w*[Cc]onstraint)\s+(\w+)\s*\{/i);
    if (reqM) { i++; const p = readBlock(); requirements.push({ kind: reqM[1], id: reqM[2], ...p }); continue; }

    // Element block opener.
    const elemM = line.match(/^element\s+(\w+)\s*\{/i);
    if (elemM) { i++; const p = readBlock(); elements.push({ id: elemM[1], ...p }); continue; }

    // Relationship: `from - <relationship words> -> to` (e.g. `a - satisfies -> b`).
    const relM = line.match(/^(\w+)\s*-\s*([\w\s]+?)\s*->\s*(\w+)/);
    if (relM) rels.push({ from: relM[1], rel: relM[2].trim(), to: relM[3] });

    i++;
  }

  return { type: 'requirement', requirements, elements, rels };
}
