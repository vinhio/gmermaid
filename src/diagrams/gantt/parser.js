/**
 * Parses Mermaid `gantt` syntax into a GanttAST.
 * @module diagrams/gantt/parser
 *
 * Aims to cover the documented Mermaid gantt syntax:
 * https://mermaid.js.org/syntax/gantt.html
 */

const DAY = 86400000;

/**
 * Parse an ISO date (`YYYY-MM-DD`) or date-time (`YYYY-MM-DD HH:mm[:ss]`) into a
 * UTC epoch timestamp.
 * @param {string} s - Candidate date string.
 * @returns {number|null} Milliseconds since epoch (UTC), or null if not a date.
 */
function parseDate(s) {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return null;
}

/**
 * Parse a duration token into milliseconds. Units (case-sensitive): `ms`, `s`,
 * `m` (minutes), `h`, `d`, `w`, `M` (months ≈ 30d), `y` (≈ 365d). Decimals allowed.
 * @param {string} s - Duration token, e.g. "5d", "1.5w", "30m", "1M".
 * @returns {number} Duration in milliseconds, or 0 if unrecognized.
 */
function parseDuration(s) {
  const m = s.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d|w|M|y)$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case 'ms': return n;
    case 's':  return n * 1000;
    case 'm':  return n * 60000;
    case 'h':  return n * 3600000;
    case 'd':  return n * DAY;
    case 'w':  return n * 7 * DAY;
    case 'M':  return n * 30 * DAY;
    case 'y':  return n * 365 * DAY;
    default:   return 0;
  }
}

/** Recognized leading task-status keywords in a task spec. */
const STATUSES = new Set(['done', 'active', 'crit', 'milestone']);

/**
 * Parse Mermaid gantt text into a GanttAST.
 *
 * Two passes: first collects raw tasks (grouped into sections) with unresolved
 * start/end specs, then resolves each task's absolute start/end, following
 * `after <id...>` / `until <id>` dependencies and chaining to the previous
 * task's end when a task omits an explicit start.
 *
 * @param {string} text - Raw Mermaid gantt source.
 * @returns {{
 *   type: 'gantt',
 *   title: string,
 *   sections: Array<{name: string, tasks: Array<{id: string, label: string, start: number, end: number, status: (string|null), milestone: boolean, done: boolean, active: boolean, crit: boolean}>}>,
 *   markers: Array<{date: number, label: string}>,
 *   minDate: number,
 *   maxDate: number
 * }} GanttAST. `start`/`end` are UTC epoch ms; `markers` are `vert` lines.
 */
export function parseGantt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));

  let title = '';
  const sections = [];
  const rawTasks = [];
  const rawMarkers = [];
  let current = null;
  let taskCounter = 0;

  for (const line of lines) {
    if (/^gantt\b/i.test(line)) continue;
    if (/^title\s/i.test(line)) { title = line.replace(/^title\s+/i, '').trim(); continue; }
    if (/^section\s/i.test(line)) { current = { name: line.replace(/^section\s+/i, '').trim(), tasks: [] }; sections.push(current); continue; }

    // Vertical marker: `vert <date>` (optionally `vert <label> : <date>`).
    const vertM = line.match(/^vert\s+(.+)$/i);
    if (vertM) {
      const spec = vertM[1];
      const ci = spec.indexOf(':');
      const dateTok = (ci >= 0 ? spec.slice(ci + 1) : spec).trim();
      rawMarkers.push({ token: dateTok, label: ci >= 0 ? spec.slice(0, ci).trim() : '' });
      continue;
    }

    // Configuration / interaction directives — recognized but not scheduled.
    if (/^(dateFormat|axisFormat|excludes|includes|tickInterval|todayMarker|weekday|click)\b/i.test(line)) continue;

    if (!line.includes(':')) continue;
    if (!current) { current = { name: '', tasks: [] }; sections.push(current); }

    const colonIdx = line.indexOf(':');
    const label = line.slice(0, colonIdx).trim();
    const parts = line.slice(colonIdx + 1).trim().split(',').map(p => p.trim()).filter(Boolean);

    const statuses = [];
    let i = 0;
    while (parts[i] && STATUSES.has(parts[i].toLowerCase())) { statuses.push(parts[i].toLowerCase()); i++; }

    // Optional id: a token that isn't a date, duration, or after/until clause.
    let taskId = `__t${++taskCounter}`;
    if (parts[i] && parseDate(parts[i]) === null && parseDuration(parts[i]) === 0 && !/^(after|until)\b/i.test(parts[i])) {
      taskId = parts[i]; i++;
    }

    // Start spec: `after id...`, an explicit date, or none (chain to previous).
    let rawStart = null;
    if (parts[i] && /^after\s+/i.test(parts[i])) { rawStart = { after: parts[i].split(/\s+/).slice(1) }; i++; }
    else if (parts[i] && parseDate(parts[i]) !== null) { rawStart = parseDate(parts[i]); i++; }

    // End spec: `until id`, a date, or a duration.
    let rawEnd = null;
    if (parts[i] && /^until\s+/i.test(parts[i])) { rawEnd = { until: parts[i].split(/\s+/)[1] }; i++; }
    else if (parts[i]) {
      const d = parseDate(parts[i]);
      rawEnd = d !== null ? d : (parseDuration(parts[i]) || null);
    }

    const raw = {
      label, id: taskId, statuses,
      milestone: statuses.includes('milestone'),
      rawStart, rawEnd,
    };
    current.tasks.push(raw);
    rawTasks.push(raw);
  }

  if (!sections.length) return { type: 'gantt', title, sections: [], markers: [], minDate: Date.now(), maxDate: Date.now() };

  // Resolve dates. Base for un-dated first tasks = earliest explicit date, else today.
  const idMap = new Map(rawTasks.map(t => [t.id, t]));
  const explicitDates = rawTasks.map(t => typeof t.rawStart === 'number' ? t.rawStart : null).filter(x => x != null);
  const base = explicitDates.length ? Math.min(...explicitDates) : Date.now();
  const resolved = new Map();
  let prevEnd = null;

  /**
   * Resolve one raw task to absolute `{ start, end }` ms, recursively resolving
   * `after`/`until` dependencies first. Memoized.
   * @param {object} t - Raw task.
   * @returns {{start: number, end: number}} Resolved UTC epoch-ms bounds.
   */
  function resolve(t) {
    if (resolved.has(t.id)) return resolved.get(t.id);
    resolved.set(t.id, { start: base, end: base }); // cycle guard

    let start;
    if (t.rawStart === null) start = prevEnd ?? base;
    else if (typeof t.rawStart === 'number') start = t.rawStart;
    else { // after one or more ids → the latest dependency end (not the prev task)
      let s = -Infinity;
      for (const id of t.rawStart.after) { const dep = idMap.get(id); if (dep) s = Math.max(s, resolve(dep).end); }
      start = s === -Infinity ? (prevEnd ?? base) : s;
    }

    let end;
    if (t.rawEnd === null) end = start + (t.milestone ? DAY : 7 * DAY);
    else if (typeof t.rawEnd === 'number') end = t.rawEnd > 1e12 ? t.rawEnd : start + t.rawEnd;
    else { const dep = idMap.get(t.rawEnd.until); end = dep ? resolve(dep).start : start + DAY; }

    const res = { start, end };
    resolved.set(t.id, res);
    prevEnd = end;
    return res;
  }

  const finalSections = sections.map(sec => ({
    name: sec.name,
    tasks: sec.tasks.map(t => {
      const r = resolve(t);
      const status = t.statuses.includes('crit') ? 'crit' : t.statuses.includes('active') ? 'active' : t.statuses.includes('done') ? 'done' : null;
      return {
        id: t.id, label: t.label, start: r.start, end: r.end, status,
        milestone: t.milestone,
        done: t.statuses.includes('done'), active: t.statuses.includes('active'), crit: t.statuses.includes('crit'),
      };
    }),
  }));

  // Resolve vert markers (a date, or a task id whose start is used).
  const markers = rawMarkers.map(m => {
    const d = parseDate(m.token);
    if (d !== null) return { date: d, label: m.label };
    const dep = idMap.get(m.token);
    return dep ? { date: resolve(dep).start, label: m.label || m.token } : null;
  }).filter(Boolean);

  const allTasks = finalSections.flatMap(s => s.tasks);
  const minDate = Math.min(...allTasks.map(t => t.start), ...markers.map(m => m.date));
  const maxDate = Math.max(...allTasks.map(t => t.end),   ...markers.map(m => m.date));

  return { type: 'gantt', title, sections: finalSections, markers, minDate, maxDate };
}
