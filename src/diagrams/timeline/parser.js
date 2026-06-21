/**
 * Parses Mermaid timeline syntax into a TimelineAST.
 * @module diagrams/timeline/parser
 */

/**
 * Parse Mermaid timeline text into a TimelineAST.
 *
 * Recognized lines: `title <text>`, `section <name>`, and `<period> : <event>`.
 * A line with an empty period but a non-empty event appends an additional event
 * to the most recent item (multi-event entries).
 *
 * @param {string} text - Raw Mermaid timeline source.
 * @returns {{type: 'timeline', title: string, items: Array<{period: string, section: string, events: string[]}>}}
 *   TimelineAST. Each item pairs a `period` with the `section` it falls under
 *   and its list of `events`.
 */
export function parseTimeline(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  let title = '';
  const items = [];
  let currentSection = '';

  for (const line of lines) {
    if (/^timeline\b/i.test(line)) continue;
    if (/^title\s+/i.test(line)) { title = line.replace(/^title\s+/i, '').trim(); continue; }
    if (/^section\s+/i.test(line)) { currentSection = line.replace(/^section\s+/i, '').trim(); continue; }

    const colon = line.indexOf(':');
    if (colon < 0) continue;

    const period = line.slice(0, colon).trim();
    const event  = line.slice(colon + 1).trim();

    if (period) {
      // New item under the current section.
      items.push({ period, section: currentSection, events: event ? [event] : [] });
    } else if (items.length > 0 && event) {
      // Continuation line: attach another event to the previous item.
      items[items.length - 1].events.push(event);
    }
  }

  return { type: 'timeline', title, items };
}
