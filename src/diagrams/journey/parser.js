/**
 * Parses Mermaid `journey` syntax into a JourneyAST.
 * @module diagrams/journey/parser
 */

/**
 * Parses Mermaid user-journey text into an AST. Does not touch the DOM.
 *
 * Recognised lines: the `journey` header, `title <text>`, `section <label>`,
 * and task rows of the form `Task name: score: Actor1, Actor2`. Tasks before
 * the first `section` are collected into an implicit unlabelled section.
 *
 * @param {string} text - Raw Mermaid journey source.
 * @returns {{
 *   type: 'journey',
 *   title: string,
 *   sections: Array<{ label: string, tasks: Array<{ name: string, score: number, actors: string[] }> }>
 * }} JourneyAST. `score` is clamped to 1..5; `actors` is a possibly empty list.
 */
export function parseJourney(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  let title = '';
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    if (/^journey\b/i.test(line)) continue;
    if (/^title\s+/i.test(line)) { title = line.replace(/^title\s+/i, '').trim(); continue; }
    if (/^section\s+/i.test(line)) {
      currentSection = { label: line.replace(/^section\s+/i, '').trim(), tasks: [] };
      sections.push(currentSection);
      continue;
    }

    // Task: "Task name: score: Actor1, Actor2" (actors optional). The name is
    // matched non-greedily so a colon inside it doesn't shift the score field.
    const m = line.match(/^(.+?)\s*:\s*(\d+)\s*(?::\s*(.*))?$/);
    if (m) {
      const name = m[1].trim();
      if (!name) continue;
      // Default to a neutral score of 3, then clamp into the valid 1..5 range.
      const score = Math.min(5, Math.max(1, parseInt(m[2], 10) || 3));
      const actors = m[3] ? m[3].split(',').map(a => a.trim()).filter(Boolean) : [];
      // Tasks appearing before any `section` go into an implicit unlabelled one.
      if (!currentSection) {
        currentSection = { label: '', tasks: [] };
        sections.push(currentSection);
      }
      currentSection.tasks.push({ name, score, actors });
    }
  }

  return { type: 'journey', title, sections };
}
