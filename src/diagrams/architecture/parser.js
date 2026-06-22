/**
 * @file Parses Mermaid `architecture-beta` syntax into an ArchitectureAST.
 *
 * Recognizes groups (and nested groups via `in`), services and junctions
 * (assigned to a group via `in`), and port-to-port edges with optional arrows
 * and the `{group}` boundary modifier. Parsing never touches the DOM.
 * https://mermaid.js.org/syntax/architecture.html
 */

/**
 * Parse Mermaid architecture-beta text into an ArchitectureAST.
 *
 * @param {string} text - Raw architecture-beta source.
 * @returns {{
 *   type: 'architecture',
 *   services: Array<{ id: string, icon: string, label: string, group: string|null, kind: 'service'|'junction' }>,
 *   groups: Array<{ id: string, icon: string, label: string, parent: string|null }>,
 *   connections: Array<{ from: string, fromPort: string, fromGroup: boolean, to: string, toPort: string, toGroup: boolean, startArrow: boolean, endArrow: boolean }>
 * }} AST of services/junctions, groups (with optional parent), and edges.
 */
export function parseArchitecture(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  const services = [];
  const groups   = [];
  const connections = [];

  for (const line of lines) {
    if (/^architecture(?:-beta)?\b/i.test(line)) continue;

    // group id(icon)[Title] [in parent]
    let m = line.match(/^group\s+(\w+)(?:\(([\w:-]+)\))?(?:\[([^\]]*)\])?(?:\s+in\s+(\w+))?\s*$/i);
    if (m) { groups.push({ id: m[1], icon: m[2] ?? '', label: m[3] ?? m[1], parent: m[4] ?? null }); continue; }

    // service id(icon)[Title] [in group]   (db/storage are legacy aliases)
    m = line.match(/^(?:service|db|storage)\s+(\w+)(?:\(([\w:-]+)\))?(?:\[([^\]]*)\])?(?:\s+in\s+(\w+))?\s*$/i);
    if (m) { services.push({ id: m[1], icon: m[2] ?? 'server', label: m[3] ?? m[1], group: m[4] ?? null, kind: 'service' }); continue; }

    // junction id [in group]
    m = line.match(/^junction\s+(\w+)(?:\s+in\s+(\w+))?\s*$/i);
    if (m) { services.push({ id: m[1], icon: '', label: '', group: m[2] ?? null, kind: 'junction' }); continue; }

    // Edge: from{group}?:PORT <op> PORT:to{group}?  where op is --, -->, <--, <-->.
    m = line.match(/^(\w+)(\{group\})?\s*:\s*([LRTB])\s*(<?--+>?)\s*([LRTB])\s*:\s*(\w+)(\{group\})?/i);
    if (m) {
      connections.push({
        from: m[1], fromGroup: !!m[2], fromPort: m[3].toUpperCase(),
        startArrow: m[4].startsWith('<'), endArrow: m[4].endsWith('>'),
        toPort: m[5].toUpperCase(), to: m[6], toGroup: !!m[7],
      });
    }
  }

  return { type: 'architecture', services, groups, connections };
}
