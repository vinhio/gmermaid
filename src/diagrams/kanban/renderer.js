/**
 * @file Renders a KanbanAST into SVG.
 *
 * Draws each column as a vertical board lane (colored background + header with
 * a card-count badge) and stacks its cards beneath. Cards show a label, an
 * optional ticket line, and a left priority stripe colored by priority level.
 */
import { svgEl } from '../../core/renderer.js';

// Board geometry (SVG user units): column/card sizes, gaps and outer padding.
const COL_W = 180, CARD_H = 44, CARD_GAP = 8, COL_GAP = 20, PAD = 30;
const COL_HEADER_H = 32;
// Priority label → stripe color.
const PRIORITY_COLORS = { 'Very High': 'oklch(0.6 0.18 30)', High: 'oklch(0.65 0.15 45)', Medium: 'oklch(0.68 0.12 80)', Low: 'oklch(0.62 0.1 155)' };
const HUES = [220, 160, 45, 330, 90, 270]; // per-column hue cycle

/**
 * Render a KanbanAST into the given SVG layers.
 *
 * @param {{ columns: Array<{label: string, cards: Array<{label: string, ticket?: string, priority?: string}>}> }} ast - Parsed kanban AST.
 * @param {SVGElement} nodeLayer - Layer that receives the board group.
 * @param {SVGElement} edgeLayer - Layer cleared but unused.
 * @returns {void}
 */
export function renderKanban(ast, nodeLayer, edgeLayer) {
  nodeLayer.replaceChildren(); edgeLayer.replaceChildren();
  const { columns } = ast;
  if (!columns.length) return;

  const g = svgEl('g');

  columns.forEach((col, ci) => {
    const cx = PAD + ci * (COL_W + COL_GAP); // column left x
    // Lane height grows with its card count.
    const colHeight = COL_HEADER_H + col.cards.length * (CARD_H + CARD_GAP) + CARD_GAP;
    const colColor  = `oklch(0.22 0.04 ${HUES[ci % HUES.length]})`;
    const hdColor   = `oklch(0.38 0.10 ${HUES[ci % HUES.length]})`;

    // Column background
    g.appendChild(svgEl('rect', {
      class: 'gm-kanban-col',
      x: cx, y: PAD, width: COL_W, height: colHeight,
      fill: colColor, rx: 8,
    }));
    // Column header: rounded top bar, plus a square patch over its lower edge
    // so only the top corners stay rounded against the lane body.
    g.appendChild(svgEl('rect', { x: cx, y: PAD, width: COL_W, height: COL_HEADER_H, fill: hdColor, rx: 8 }));
    g.appendChild(svgEl('rect', { x: cx, y: PAD + COL_HEADER_H - 8, width: COL_W, height: 8, fill: hdColor }));
    g.appendChild(svgEl('text', {
      class: 'gm-kanban-col-label',
      x: cx + COL_W / 2, y: PAD + COL_HEADER_H / 2,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: '#fff', 'font-size': '12', 'font-weight': '600', 'pointer-events': 'none',
    }, col.label.length > 18 ? col.label.slice(0,17)+'…' : col.label));
    // Card count badge
    g.appendChild(svgEl('text', { x: cx + COL_W - 8, y: PAD + COL_HEADER_H / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle', fill: 'rgba(255,255,255,.55)', 'font-size': '10', 'pointer-events': 'none' }, String(col.cards.length)));

    // Cards, stacked top-down below the header.
    col.cards.forEach((card, ki) => {
      const cy = PAD + COL_HEADER_H + CARD_GAP + ki * (CARD_H + CARD_GAP); // card top y
      const priorityColor = PRIORITY_COLORS[card.priority] ?? null;

      // Card background
      g.appendChild(svgEl('rect', {
        class: 'gm-kanban-card',
        x: cx + 6, y: cy, width: COL_W - 12, height: CARD_H,
        fill: 'var(--gm-panel)', stroke: 'var(--gm-panel-border)',
        'stroke-width': '1', rx: 6,
      }));

      // Priority stripe
      if (priorityColor) {
        g.appendChild(svgEl('rect', { x: cx + 6, y: cy, width: 4, height: CARD_H, fill: priorityColor, rx: 3 }));
      }

      // Label (shifted up slightly when a ticket line is also shown).
      const label = card.label.length > 20 ? card.label.slice(0,19)+'…' : card.label;
      g.appendChild(svgEl('text', {
        class: 'gm-kanban-card-label',
        x: cx + 16, y: cy + CARD_H / 2 - (card.ticket ? 5 : 0),
        'dominant-baseline': 'middle', fill: 'var(--gm-text)', 'font-size': '11', 'pointer-events': 'none',
      }, label));

      // Ticket
      if (card.ticket) {
        g.appendChild(svgEl('text', {
          class: 'gm-kanban-ticket',
          x: cx + 16, y: cy + CARD_H / 2 + 9,
          'dominant-baseline': 'middle', fill: 'var(--gm-muted)', 'font-size': '9', 'pointer-events': 'none',
        }, card.ticket));
      }
    });
  });

  nodeLayer.appendChild(g);
}
