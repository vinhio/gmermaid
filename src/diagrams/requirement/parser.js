/**
 * Parses Mermaid `requirementDiagram` syntax into a RequirementAST.
 * @module diagrams/requirement/parser
 *
 * Aims to cover the documented Mermaid requirement syntax:
 * https://mermaid.js.org/syntax/requirementDiagram.html
 */

/**
 * Parses Mermaid requirement-diagram text into an AST. Does not touch the DOM.
 *
 * Lines are consumed with a shared index `i` because requirement/element bodies
 * are multi-line brace blocks read via {@link readBlock}. Recognises requirement
 * blocks, element blocks, forward (`a - rel -> b`) and reverse (`b <- rel - a`)
 * relationships, `direction`, and styling (`classDef`/`class`/`style`/`:::`).
 *
 * @param {string} text - Raw Mermaid requirementDiagram source.
 * @returns {{
 *   type: 'requirement',
 *   direction: 'TB'|'BT'|'LR'|'RL',
 *   requirements: Array<{ id: string, kind: string, reqId: string, text: string, risk: string, verifyMethod: string, style?: object }>,
 *   elements: Array<{ id: string, type: string, docref: string, style?: object }>,
 *   rels: Array<{ from: string, rel: string, to: string }>
 * }} RequirementAST. The node `id` is the user-defined name (used by relationships).
 */
export function parseRequirement(text) {
  const lines = text.split('\n');
  const requirements = [], elements = [], rels = [];
  const classDefs = {}, classAssign = {};
  let direction = 'TB';
  let i = 0; // Shared cursor advanced by both the main loop and readBlock.

  /**
   * Consumes lines from the current cursor until a closing `}`, collecting the
   * `key: value` properties of a requirement/element body.
   * @returns {Object<string, string>} Map of property name (lower-cased) to value.
   */
  function readBlock() {
    const props = {};
    while (i < lines.length) {
      const l = lines[i].trim();
      i++;
      if (l === '}') return props;
      const m = l.match(/^(\w+):\s*(.+)$/);
      if (m) props[m[1].toLowerCase()] = m[2].trim();
    }
    return props;
  }

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || line.startsWith('%%') || /^requirementDiagram\b/i.test(line)) { i++; continue; }

    // direction TB|BT|LR|RL
    const dirM = line.match(/^direction\s+(TB|TD|BT|LR|RL)\b/i);
    if (dirM) { direction = dirM[1].toUpperCase() === 'TD' ? 'TB' : dirM[1].toUpperCase(); i++; continue; }

    // Requirement/constraint block. The node id is the NAME; the block `id:` is
    // kept separately as `reqId` (it must not overwrite the node identifier).
    const reqM = line.match(/^(\w*[Rr]equirement|\w*[Cc]onstraint)\s+(\w+)\s*\{/);
    if (reqM) {
      i++; const p = readBlock();
      requirements.push({ id: reqM[2], kind: reqM[1], reqId: p.id ?? '', text: p.text ?? '', risk: p.risk ?? '', verifyMethod: p.verifymethod ?? '' });
      continue;
    }

    // Element block.
    const elemM = line.match(/^element\s+(\w+)\s*\{/i);
    if (elemM) {
      i++; const p = readBlock();
      elements.push({ id: elemM[1], type: p.type ?? '', docref: p.docref ?? '' });
      continue;
    }

    // Styling directives.
    const cdM = line.match(/^classDef\s+(\w+)\s+(.+)/i);
    if (cdM) { classDefs[cdM[1]] = parseStyleStr(cdM[2]); i++; continue; }
    const clM = line.match(/^class\s+([\w,\s]+?)\s+(\w+)\s*$/i);
    if (clM) { clM[1].split(',').map(s => s.trim()).forEach(id => { classAssign[id] = clM[2]; }); i++; continue; }
    const styM = line.match(/^style\s+(\w+)\s+(.+)/i);
    if (styM) { classAssign[styM[1]] = null; (classDefs['__' + styM[1]] = parseStyleStr(styM[2])); classAssign[styM[1]] = '__' + styM[1]; i++; continue; }
    const tripleM = line.match(/^(\w+):::(\w+)\s*$/);
    if (tripleM) { classAssign[tripleM[1]] = tripleM[2]; i++; continue; }

    // Relationship — forward `{a} - rel -> {b}` or reverse `{b} <- rel - {a}`.
    const fwd = line.match(/^\{?(\w+)\}?\s*-\s*([\w\s]+?)\s*->\s*\{?(\w+)\}?/);
    if (fwd) { rels.push({ from: fwd[1], rel: fwd[2].trim(), to: fwd[3] }); i++; continue; }
    const rev = line.match(/^\{?(\w+)\}?\s*<-\s*([\w\s]+?)\s*-\s*\{?(\w+)\}?/);
    if (rev) { rels.push({ from: rev[3], rel: rev[2].trim(), to: rev[1] }); i++; continue; }

    i++;
  }

  // Apply class/inline styles by node id.
  for (const node of [...requirements, ...elements]) {
    const cls = classAssign[node.id];
    if (cls && classDefs[cls]) node.style = { ...classDefs[cls] };
  }

  return { type: 'requirement', direction, requirements, elements, rels };
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
