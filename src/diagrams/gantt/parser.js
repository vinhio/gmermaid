/**
 * Parses Mermaid gantt syntax into a GanttAST.
 * @module diagrams/gantt/parser
 */

/**
 * Parse an ISO `YYYY-MM-DD` string into a UTC epoch timestamp.
 * @param {string} s - Candidate date string.
 * @returns {number|null} Milliseconds since epoch (UTC midnight), or null if not an ISO date.
 */
function parseIsoDate(s) {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

/**
 * Parse a duration token (`<n>d`, `<n>w`, `<n>h`) into milliseconds.
 * @param {string} s - Duration token, e.g. "5d", "2w", "8h".
 * @returns {number} Duration in milliseconds, or 0 if unrecognized.
 */
function parseDuration(s) {
  const m = s.match(/^(\d+)(d|w|h)$/i);
  if (!m) return 0;
  const n = +m[1];
  switch (m[2].toLowerCase()) {
    case 'd': return n * 86400000;
    case 'w': return n * 7 * 86400000;
    case 'h': return n * 3600000;
    default:  return 0;
  }
}

/** Recognized leading task-status keywords in a task spec. */
const STATUSES = new Set(['done', 'active', 'crit', 'milestone']);

/**
 * Parse Mermaid gantt text into a GanttAST.
 *
 * Two passes: first collects raw tasks (grouped into sections) with unresolved
 * start/end specs, then resolves each task's absolute start/end timestamps,
 * following `after <id>` dependencies and chaining to the previous task's end
 * when a task omits an explicit start.
 *
 * Task spec grammar (comma-separated, all parts optional except a date/duration):
 *   `[status,] [id,] <dateSpec>`
 * where dateSpec is one of: `<ISO date>[, <ISO date | duration>]`,
 * `after <id>[, <duration>]`, or a bare `<duration>`.
 *
 * @param {string} text - Raw Mermaid gantt source.
 * @returns {{
 *   type: 'gantt',
 *   title: string,
 *   sections: Array<{name: string, tasks: Array<{id: string, label: string, start: number, end: number, status: (string|null)}>}>,
 *   minDate: number,
 *   maxDate: number
 * }} GanttAST. `start`/`end` are UTC epoch ms; `minDate`/`maxDate` bound the
 *   whole chart for axis scaling; `status` is one of {@link STATUSES} or null.
 */
export function parseGantt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));

  let title   = '';
  const sections = [];
  let current = null;
  let taskCounter = 0;

  // Raw tasks with unresolved deps
  const rawTasks = [];

  for (const line of lines) {
    if (/^gantt$/i.test(line))        continue;
    if (/^dateFormat\s/i.test(line))  continue;
    if (/^axisFormat\s/i.test(line))  continue;
    if (/^excludes\s/i.test(line))    continue;
    if (/^tickInterval\s/i.test(line)) continue;

    if (/^title\s/i.test(line)) {
      title = line.replace(/^title\s+/i, '').trim();
      continue;
    }

    if (/^section\s/i.test(line)) {
      current = { name: line.replace(/^section\s+/i, '').trim(), tasks: [] };
      sections.push(current);
      continue;
    }

    if (!line.includes(':')) continue;

    // Ensure we have a section
    if (!current) {
      current = { name: '', tasks: [] };
      sections.push(current);
    }

    const colonIdx = line.indexOf(':');
    const label    = line.slice(0, colonIdx).trim();
    const spec     = line.slice(colonIdx + 1).trim();
    const parts    = spec.split(',').map(p => p.trim());

    let status  = null;
    let taskId  = `t${++taskCounter}`;
    let rawStart = null; // ms | { after: id } | null
    let rawEnd   = null; // ms | durationMs | null

    let i = 0;

    // Optional status
    if (parts[i] && STATUSES.has(parts[i].toLowerCase())) {
      status = parts[i].toLowerCase();
      i++;
    }

    // Optional id: a word that is not an ISO date, a duration, or an 'after ...' clause.
    if (parts[i] && !/^\d{4}-/.test(parts[i]) && !/^\d+(d|w|h)$/i.test(parts[i]) && !/^after\s/i.test(parts[i])) {
      taskId = parts[i];
      i++;
    }

    // dateSpec
    if (parts[i]) {
      if (/^after\s+\S+$/i.test(parts[i])) {
        rawStart = { after: parts[i].split(/\s+/)[1] };
        i++;
        if (parts[i]) rawEnd = parseDuration(parts[i]) || null;
      } else {
        const maybeDate = parseIsoDate(parts[i]);
        if (maybeDate !== null) {
          rawStart = maybeDate;
          i++;
          if (parts[i]) {
            const asDate = parseIsoDate(parts[i]);
            if (asDate !== null) rawEnd = asDate;
            else rawEnd = parseDuration(parts[i]) || null;
          }
        } else {
          // duration only
          rawEnd = parseDuration(parts[i]) || null;
        }
      }
    }

    const raw = { label, id: taskId, status, rawStart, rawEnd, sectionIdx: sections.length - 1 };
    current.tasks.push(raw);
    rawTasks.push(raw);
  }

  // Default section if none defined
  if (!sections.length) return { type: 'gantt', title, sections: [], minDate: Date.now(), maxDate: Date.now() };

  // Second pass: resolve dates
  const idMap    = new Map(rawTasks.map(t => [t.id, t]));
  const resolved = new Map(); // id → { start, end } memoized resolution
  let   prevEnd  = null;       // end of the most recently resolved task (for chaining)

  /**
   * Resolve one raw task to absolute `{ start, end }` ms, recursively resolving
   * any `after <id>` dependency first. Results are memoized in `resolved`.
   * @param {{id: string, rawStart: (number|{after: string}|null), rawEnd: (number|null)}} t - Raw task.
   * @returns {{start: number, end: number}} Resolved UTC epoch-ms bounds.
   */
  function resolve(t) {
    if (resolved.has(t.id)) return resolved.get(t.id);

    let start = null;
    if (t.rawStart === null) {
      start = prevEnd ?? 0;
    } else if (typeof t.rawStart === 'number') {
      start = t.rawStart;
    } else if (t.rawStart.after) {
      const dep = idMap.get(t.rawStart.after);
      if (dep) {
        const depRes = resolve(dep);
        start = depRes.end;
      } else {
        start = prevEnd ?? 0;
      }
    }

    let end;
    if (t.rawEnd === null) {
      end = start + 7 * 86400000; // default 7d
    } else if (typeof t.rawEnd === 'number') {
      // Could be absolute date (large) or duration (smaller)
      end = t.rawEnd > 1e12 ? t.rawEnd : start + t.rawEnd;
    } else {
      end = start + 7 * 86400000;
    }

    const res = { start, end };
    resolved.set(t.id, res);
    prevEnd = end;
    return res;
  }

  // Rebuild sections with resolved tasks
  const finalSections = sections.map(sec => ({
    name: sec.name,
    tasks: sec.tasks.map(t => {
      const r = resolve(t);
      return { id: t.id, label: t.label, start: r.start, end: r.end, status: t.status };
    }),
  }));

  const allTasks = finalSections.flatMap(s => s.tasks);
  const minDate  = allTasks.reduce((m, t) => Math.min(m, t.start), Infinity);
  const maxDate  = allTasks.reduce((m, t) => Math.max(m, t.end),   -Infinity);

  return { type: 'gantt', title, sections: finalSections, minDate, maxDate };
}
