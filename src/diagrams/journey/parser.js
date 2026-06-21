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

    // Task: "Task name: score: Actor1, Actor2"
    const parts = line.split(':');
    if (parts.length >= 2) {
      const name  = parts[0].trim();
      // Default to a neutral score of 3 when missing or non-numeric.
      const score = parseInt(parts[1]?.trim(), 10) || 3;
      const actors = parts[2] ? parts[2].split(',').map(a => a.trim()).filter(Boolean) : [];
      if (!name) continue;
      // Tasks appearing before any `section` go into an implicit unlabelled one.
      if (!currentSection) {
        currentSection = { label: '', tasks: [] };
        sections.push(currentSection);
      }
      // Clamp score into the valid 1..5 satisfaction range.
      currentSection.tasks.push({ name, score: Math.min(5, Math.max(1, score)), actors });
    }
  }

  return { type: 'journey', title, sections };
}
