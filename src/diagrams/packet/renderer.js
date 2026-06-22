/**
 * @file Renders a PacketAST into SVG.
 *
 * Lays packet bit-fields across fixed-width rows of 32 bits. Each row shows a
 * bit ruler with ticks every 8 bits and a framed background; fields are drawn
 * as colored rectangles spanning their bit range, wrapping across rows when a
 * field crosses a 32-bit boundary.
 */
import { svgEl } from '../../core/renderer.js';

// Layout constants (SVG user units). BIT_W is the pixel width of one bit cell;
// ROW_H the field-box height; TICK_H the ruler tick length; PAD the outer margin.
const BITS_PER_ROW = 32;
const BIT_W  = 20;
const ROW_H  = 40;
const TICK_H = 8;
const PAD    = 40;
const HUES   = [220, 160, 45, 330, 90, 270, 20, 185]; // per-field hue cycle

/**
 * Render a PacketAST into the given SVG layers.
 *
 * @param {{ fields: Array<{start: number, end: number, bits: number, label: string}> }} ast - Parsed packet AST (fields sorted by start bit).
 * @param {SVGElement} nodeLayer - Layer that receives the packet group.
 * @param {SVGElement} edgeLayer - Layer cleared but unused.
 * @returns {void}
 */
export function renderPacket(ast, nodeLayer, edgeLayer) {
  nodeLayer.replaceChildren(); edgeLayer.replaceChildren();
  const { title, fields } = ast;
  if (!fields.length) return;

  // Total bit count comes from the last (highest) field; rows wrap every 32 bits.
  const totalBits = fields[fields.length - 1].end + 1;
  const rows = Math.ceil(totalBits / BITS_PER_ROW);
  const titleOff = title ? 34 : 0; // vertical room reserved above the rows
  const g = svgEl('g');

  if (title) {
    g.appendChild(svgEl('text', {
      class: 'gm-packet-title',
      x: PAD + (BITS_PER_ROW * BIT_W) / 2, y: PAD - 6,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: 'var(--gm-text)', 'font-family': 'var(--gm-label-font)', 'font-size': 15, 'font-weight': 600,
    }, title));
  }

  // Bit ruler: per row, a tick + bit-number label every 8 bits (0, 8, 16, 24).
  // Row vertical pitch = ROW_H + TICK_H + 24 (box + ticks + label gutter).
  for (let r = 0; r < rows; r++) {
    const ry = PAD + titleOff + r * (ROW_H + TICK_H + 24);
    for (let b = 0; b < BITS_PER_ROW; b += 8) {
      const bx = PAD + b * BIT_W;
      g.appendChild(svgEl('line', { x1: bx, y1: ry, x2: bx, y2: ry - TICK_H, stroke: 'var(--gm-muted)', 'stroke-width': '1' }));
      g.appendChild(svgEl('text', { class: 'gm-packet-bit', x: bx, y: ry - TICK_H - 4, 'text-anchor': 'middle', 'dominant-baseline': 'auto' }, String(r * BITS_PER_ROW + b)));
    }
    // Row border
    g.appendChild(svgEl('rect', { x: PAD, y: ry, width: BITS_PER_ROW * BIT_W, height: ROW_H, fill: 'var(--gm-panel)', stroke: 'var(--gm-panel-border)', 'stroke-width': '1', rx: 4 }));
  }

  // Fields: draw one rect per row the field touches. A field wider than the
  // remaining row is split into segments (seg counts them) and continues below.
  fields.forEach((field, fi) => {
    const color = `oklch(0.42 0.12 ${HUES[fi % HUES.length]})`;
    let bit = field.start;
    let seg = 0;
    while (bit <= field.end) {
      const rowIndex = Math.floor(bit / BITS_PER_ROW);
      const bitInRow = bit % BITS_PER_ROW; // column offset within the 32-bit row
      const endBitInRow = Math.min(field.end % BITS_PER_ROW + (field.end < (rowIndex + 1) * BITS_PER_ROW ? 0 : BITS_PER_ROW - 1), BITS_PER_ROW - 1 + (rowIndex > Math.floor(field.end / BITS_PER_ROW) ? 0 : BITS_PER_ROW));
      // Clamp this segment to the end of the current row; width spans its bits.
      const endBit = Math.min(field.end, (rowIndex + 1) * BITS_PER_ROW - 1);
      const w = (endBit - bit + 1) * BIT_W;
      const ry = PAD + titleOff + rowIndex * (ROW_H + TICK_H + 24);
      const fx = PAD + bitInRow * BIT_W;

      g.appendChild(svgEl('rect', {
        class: 'gm-packet-field',
        x: fx + 1, y: ry + 1, width: w - 2, height: ROW_H - 2,
        fill: color, rx: 3, opacity: '0.85',
      }));

      // Label only on the first segment, and only if the box is wide enough.
      // Truncate to roughly one char per 7px of box width.
      if (seg === 0 && w >= 20) {
        const label = field.label.length > Math.floor(w / 7) ? field.label.slice(0, Math.floor(w / 7) - 1) + '…' : field.label;
        g.appendChild(svgEl('text', {
          class: 'gm-packet-label',
          x: fx + w / 2, y: ry + ROW_H / 2,
          'text-anchor': 'middle', 'dominant-baseline': 'middle',
          fill: '#fff', 'pointer-events': 'none',
        }, label));
      }

      bit = endBit + 1;
      seg++;
    }
  });

  nodeLayer.appendChild(g);
}
