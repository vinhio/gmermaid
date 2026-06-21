/**
 * @file Parses Mermaid `architecture-beta` syntax into an ArchitectureAST.
 *
 * Recognizes group blocks, services (including `db`/`storage` aliases) with
 * optional icon and label, and port-to-port connections. Services declared
 * inside an open `group { ... }` block are associated with that group.
 * Parsing never touches the DOM.
 */

/**
 * Parse Mermaid architecture-beta text into an ArchitectureAST.
 *
 * @param {string} text - Raw architecture-beta source.
 * @returns {{
 *   type: 'architecture',
 *   services: Array<{ id: string, icon: string, label: string, group: string|null }>,
 *   groups: Array<{ id: string, icon: string, label: string, services: string[] }>,
 *   connections: Array<{ from: string, fromPort: 'L'|'R'|'T'|'B', to: string, toPort: 'L'|'R'|'T'|'B' }>
 * }} AST of services, their groups, and directional port connections.
 */
export function parseArchitecture(text) {
  // Strip blank lines and %% comments.
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  const services = [];
  const groups   = [];
  const connections = [];
  let currentGroup = null; // group whose `{` is open; services attach to it

  for (const line of lines) {
    if (/^architecture-beta\b/i.test(line)) continue;

    // group id[Label] { or group id(icon)[Label] {
    const grpM = line.match(/^group\s+(\w+)(?:\((\w+)\))?(?:\[([^\]]*)\])?\s*\{?/i);
    if (grpM) { currentGroup = { id: grpM[1], icon: grpM[2] ?? '', label: grpM[3] ?? grpM[1], services: [] }; groups.push(currentGroup); continue; }
    if (line === '}') { currentGroup = null; continue; }

    // service id(icon)[Label]
    const svcM = line.match(/^(?:service|db|storage)\s+(\w+)(?:\((\w+)\))?(?:\[([^\]]*)\])?/i);
    if (svcM) {
      const svc = { id: svcM[1], icon: svcM[2] ?? 'server', label: svcM[3] ?? svcM[1], group: currentGroup?.id ?? null };
      services.push(svc);
      currentGroup?.services.push(svc.id);
      continue;
    }

    // Connection: fromId:Port -- Port:toId   (ports: L R T B side of each box).
    // Note the source port is the group before `--`, the target port after it.
    const connM = line.match(/^(\w+):(\w)\s*--\s*(\w):(\w+)/);
    if (connM) connections.push({ from: connM[1], fromPort: connM[2].toUpperCase(), to: connM[4], toPort: connM[3].toUpperCase() });
  }

  return { type: 'architecture', services, groups, connections };
}
