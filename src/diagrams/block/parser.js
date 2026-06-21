/**
 * Parses Mermaid `block-beta` syntax into a BlockAST.
 * @module diagrams/block/parser
 */

/**
 * Parses Mermaid block-diagram text into an AST. Does not touch the DOM.
 *
 * Blocks flow left-to-right into a fixed-column grid (set by `columns N`),
 * wrapping to the next row once the column cursor reaches the column count.
 * A block may span multiple columns via `id:N`, and the `space` keyword
 * advances the cursor by one cell to leave a gap.
 *
 * @param {string} text - Raw Mermaid block-beta source.
 * @returns {{
 *   type: 'block',
 *   columns: number,
 *   blocks: Array<{ id: string, label: string, span: number, row: number, col: number }>,
 *   edges: Array<{ from: string, to: string, label: string }>
 * }} BlockAST. Each block carries its grid `row`/`col` and column `span`.
 */
export function parseBlock(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  let columns = 3;
  const blocks = [];
  const edges  = [];
  let row = 0, col = 0; // Running grid cursor as blocks are placed.

  for (const line of lines) {
    if (/^block-beta\b/i.test(line)) continue;
    // `columns N` sets the grid width and restarts the cursor on a fresh column.
    const colM = line.match(/^columns\s+(\d+)/i);
    if (colM) { columns = +colM[1]; col = 0; continue; }

    // Edge: A --> B  or  A --> B --> C  (skip lines containing block labels `[`).
    if (/-->/.test(line) && !/\[/.test(line)) {
      const parts = line.split(/\s*-->\s*/);
      // Chain each adjacent pair so `A --> B --> C` yields two edges.
      for (let i = 0; i < parts.length - 1; i++) {
        const from = parts[i].trim(), to = parts[i+1].trim();
        if (from && to) edges.push({ from, to, label: '' });
      }
      continue;
    }

    // Block tokens on one line: id["label"]:span  or  id  or  space
    const tokens = line.split(/\s+/);
    for (const tok of tokens) {
      if (!tok) continue;
      if (tok.toLowerCase() === 'space') {
        // `space` leaves one empty cell, wrapping the row if it overflows.
        col++; if (col >= columns) { col = 0; row++; } continue;
      }
      const m = tok.match(/^(\w+)(?:\["([^"]*)"\])?(?::(\d+))?$/);
      if (!m) continue;
      const [, id, label, spanStr] = m;
      const span = parseInt(spanStr ?? '1');
      blocks.push({ id, label: label ?? id, span, row, col });
      // Advance the cursor by the block's span, wrapping to the next row on overflow.
      col += span;
      if (col >= columns) { col = 0; row++; }
    }
  }

  return { type: 'block', columns, blocks, edges };
}
