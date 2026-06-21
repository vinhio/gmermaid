/**
 * @file Parses Mermaid `packet-beta` syntax into a PacketAST.
 *
 * Each body line declares a bit-field as `start-end: "Label"` (or a single
 * `bit: "Label"`), describing the layout of a binary packet. Fields are
 * returned sorted by their starting bit. Parsing never touches the DOM.
 */

/**
 * Parse Mermaid packet-beta text into a PacketAST.
 *
 * @param {string} text - Raw packet-beta source.
 * @returns {{
 *   type: 'packet',
 *   fields: Array<{ start: number, end: number, bits: number, label: string }>
 * }} AST of bit-fields sorted by start bit; `bits` is the inclusive width.
 */
export function parsePacket(text) {
  // Strip blank lines and %% comments.
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  const fields = [];

  for (const line of lines) {
    if (/^packet-beta\b/i.test(line)) continue;
    // "0-15: \"Source Port\""  or  "0: \"Bit\"" — single bit when no end given.
    const m = line.match(/^(\d+)(?:-(\d+))?:\s*["']?(.+?)["']?$/);
    if (!m) continue;
    const start = +m[1];
    const end   = m[2] !== undefined ? +m[2] : start;
    fields.push({ start, end, bits: end - start + 1, label: m[3].replace(/^["']|["']$/g, '').trim() });
  }

  // Sort by start bit so the renderer can lay fields out left-to-right.
  fields.sort((a, b) => a.start - b.start);

  return { type: 'packet', fields };
}
