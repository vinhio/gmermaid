/**
 * @file Parses Mermaid `packet` / `packet-beta` syntax into a PacketAST.
 *
 * Each body line declares a bit-field as `start-end: "Label"`, a single
 * `bit: "Label"`, or the bit-count form `+N: "Label"` (which starts from the
 * end of the previous field). Fields are returned sorted by their starting bit.
 * Parsing never touches the DOM.
 * https://mermaid.js.org/syntax/packet.html
 */

/**
 * Parse Mermaid packet text into a PacketAST.
 *
 * @param {string} text - Raw packet/packet-beta source.
 * @returns {{
 *   type: 'packet',
 *   title: string,
 *   fields: Array<{ start: number, end: number, bits: number, label: string }>
 * }} AST of bit-fields sorted by start bit; `bits` is the inclusive width.
 */
export function parsePacket(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  let title = '';
  const fields = [];
  let cursor = 0; // next free bit, used to resolve `+N` fields

  for (const line of lines) {
    if (/^packet(?:-beta)?\b/i.test(line)) continue;
    if (/^title\b/i.test(line)) { title = unquote(line.replace(/^title\s*/i, '').trim()); continue; }

    // `+N: "Label"` — an N-bit field beginning at the end of the previous field.
    let m = line.match(/^\+(\d+)\s*:\s*(.+)$/);
    if (m) {
      const n = +m[1];
      const start = cursor, end = start + n - 1;
      fields.push({ start, end, bits: n, label: unquote(m[2]) });
      cursor = end + 1;
      continue;
    }

    // `start: "Label"` or `start-end: "Label"`.
    m = line.match(/^(\d+)(?:\s*-\s*(\d+))?\s*:\s*(.+)$/);
    if (m) {
      const start = +m[1];
      const end = m[2] !== undefined ? +m[2] : start;
      fields.push({ start, end, bits: end - start + 1, label: unquote(m[3]) });
      cursor = Math.max(cursor, end + 1);
    }
  }

  // Sort by start bit so the renderer can lay fields out left-to-right.
  fields.sort((a, b) => a.start - b.start);

  return { type: 'packet', title, fields };
}

/**
 * Strip a single pair of surrounding double/single quotes and whitespace.
 * @param {string} s - The raw string.
 * @returns {string} The unquoted, trimmed string.
 */
function unquote(s) {
  s = s.trim();
  if (s.length >= 2 && /^["']/.test(s) && s.endsWith(s[0])) s = s.slice(1, -1);
  return s.trim();
}
