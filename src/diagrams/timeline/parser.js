/**
 * Parses Mermaid timeline syntax into a TimelineAST.
 * @module diagrams/timeline/parser
 */

/**
 * Parse Mermaid timeline text into a TimelineAST.
 *
 * Recognized lines: `timeline [LR|TD]`, `title <text>`, `section <name>`, and
 * `<period> : <event> [: <event> ...]`. Colons separate multiple events on one
 * line. A line whose period is empty (a continuation, e.g. `: <event>`) appends
 * its events to the most recent item.
 *
 * @param {string} text - Raw Mermaid timeline source.
 * @returns {{type: 'timeline', title: string, direction: 'LR'|'TD', items: Array<{period: string, section: string, events: string[]}>}}
 *   TimelineAST. Each item pairs a `period` with the `section` it falls under
 *   and its list of `events`.
 */
export function parseTimeline(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  let title = '';
  let direction = 'LR';
  const items = [];
  let currentSection = '';

  for (const line of lines) {
    const headM = line.match(/^timeline\b(?:\s+(LR|TD))?/i);
    if (headM) { if (headM[1]) direction = headM[1].toUpperCase(); continue; }
    if (/^title\s+/i.test(line)) { title = line.replace(/^title\s+/i, '').trim(); continue; }
    if (/^section\s+/i.test(line)) { currentSection = line.replace(/^section\s+/i, '').trim(); continue; }

    if (!line.includes(':')) continue;

    // Split on every `:` — the first field is the period, the rest are events.
    const parts  = line.split(':').map(p => p.trim());
    const period = parts[0];
    const events = parts.slice(1).filter(Boolean);

    if (period) {
      items.push({ period, section: currentSection, events });
    } else if (items.length > 0 && events.length) {
      // Continuation line: attach more events to the previous item.
      items[items.length - 1].events.push(...events);
    }
  }

  return { type: 'timeline', title, direction, items };
}
