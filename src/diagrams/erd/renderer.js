/**
 * ERD renderer: draws an ErdAST into SVG. Each entity becomes a table card
 * (header + column rows) appended to nodeLayer; relationships become edges
 * with crow's-foot cardinality markers appended to edgeLayer.
 */

import { svgEl } from '../../core/renderer.js';

const TABLE_W  = 160; // minimum table card width (px); grows to fit content
const HEADER_H = 38;  // table header band height (px)
const ROW_H    = 28;  // per-column row height (px)

// Approx character widths (px) for the monospace var(--gm-font); used to size
// the card to its content without measuring the live DOM.
const CW_TITLE = 7.5; // table name (13px, bold)
const CW_TAG   = 6.6; // "N cols" tag (10px)
const CW_NAME  = 7.2; // column name (12px)
const CW_TYPE  = 6.6; // column type (11px)

/**
 * Compute a table width wide enough to fit the header (title + "N cols" tag) and
 * every column row (key-indent + name + gap + right-aligned type).
 * @param {object} entity - Entity AST entry ({ name, columns }).
 * @returns {number} The fitted width in px (>= TABLE_W).
 */
function tableWidth(entity) {
  const tag = entity.columns.length + ' cols';
  let w = 14 + entity.name.length * CW_TITLE + 16 + tag.length * CW_TAG + 14;
  for (const col of entity.columns) {
    const nameStart = (col.pk || col.fk) ? 30 : 14;
    w = Math.max(w, nameStart + col.name.length * CW_NAME + 18 + col.type.length * CW_TYPE + 14);
  }
  return Math.max(TABLE_W, Math.ceil(w));
}

/**
 * Render an ERD AST into the given SVG layers.
 * @param {object} ast - ErdAST from parseERD ({ entities, relationships }).
 * @param {SVGElement} nodeLayer - Group element that receives table cards.
 * @param {SVGElement} edgeLayer - Group element that receives relationship edges.
 * @param {{ attachDrag: Function }} interact - Interaction helper for dragging.
 * @param {boolean} [curved=true] - Whether edges use Bézier curves.
 * @returns {void}
 */
export function renderERD(ast, nodeLayer, edgeLayer, interact, curved = true) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();

  for (const entity of ast.entities) {
    // Card sized to its content: fitted width, header band + one row per column.
    entity.w = tableWidth(entity);
    entity.h = HEADER_H + entity.columns.length * ROW_H;
    const g = buildTable(entity);
    nodeLayer.appendChild(g);
    interact.attachDrag(g, entity, () => redrawRelationships(ast, edgeLayer, curved));
  }

  redrawRelationships(ast, edgeLayer, curved);
}

/**
 * Build a table card `<g>`: rounded background, header with title and column
 * count, and a row per column (with key icons and a separator line).
 * @param {object} entity - Entity AST entry ({ id, name, columns, x, y, h }).
 * @returns {SVGGElement} The positioned table group.
 */
function buildTable(entity) {
  const h = entity.h;
  const W = entity.w ?? TABLE_W;
  const g = svgEl('g', {
    class: 'gm-erd-table',
    'data-id': entity.id,
    transform: `translate(${entity.x},${entity.y})`,
  });

  // Card background (honoring any classDef/style fill & stroke override).
  const bg = { class: 'gm-erd-bg', x: 0, y: 0, width: W, height: h, rx: 10 };
  if (entity.style?.fill)   bg.fill = entity.style.fill;
  if (entity.style?.stroke) bg.stroke = entity.style.stroke;
  g.appendChild(svgEl('rect', bg));

  // Rounded header path (matches erd-viewer.html style): a rect whose top two
  // corners are rounded by radius `hr` while the bottom edge stays square so it
  // meets the card body. `hp` is a 1px inset to sit above the background stroke.
  const hp = 1, hr = 9;
  g.appendChild(svgEl('path', {
    class: 'gm-erd-header',
    d: `M${hp},${HEADER_H} L${hp},${1+hr} a${hr},${hr} 0 0 1 ${hr},${-hr} L${W-hp-hr},1 a${hr},${hr} 0 0 1 ${hr},${hr} L${W-hp},${HEADER_H} Z`,
  }));

  g.appendChild(svgEl('text', { class: 'gm-erd-title', x: 14, y: HEADER_H / 2 + 5 }, entity.name));
  g.appendChild(svgEl('text', { class: 'gm-erd-tag', x: W - 14, y: HEADER_H / 2 + 4, 'text-anchor': 'end' },
    entity.columns.length + ' cols'));

  entity.columns.forEach((col, i) => {
    const ry    = HEADER_H + i * ROW_H; // top y of this row
    const isKey = col.pk || col.fk;
    const row   = svgEl('g', { class: 'gm-erd-row' + (isKey ? ' is-key' : '') });

    if (i > 0) row.appendChild(svgEl('line', { class: 'gm-erd-sep', x1: 0, y1: ry, x2: W, y2: ry }));

    if (isKey) {
      row.appendChild(svgEl('path', { class: col.pk ? 'gm-key-pk' : 'gm-key-fk', d: keyIcon(13, ry + ROW_H / 2) }));
    }

    row.appendChild(svgEl('text', { class: 'gm-erd-col-name', x: isKey ? 30 : 14, y: ry + ROW_H / 2 + 4 }, col.name));
    row.appendChild(svgEl('text', { class: 'gm-erd-col-type', x: W - 14, y: ry + ROW_H / 2 + 4, 'text-anchor': 'end' }, col.type));

    g.appendChild(row);
  });

  return g;
}

/**
 * Build a small "key" glyph path (a ring plus a toothed shaft) for PK/FK rows.
 * @param {number} cx - Center x of the ring.
 * @param {number} cy - Center y of the ring.
 * @returns {string} An SVG path `d` string.
 */
function keyIcon(cx, cy) {
  const r = 3.2;
  // Two arcs form the ring, then a short shaft (`h6 v3 h-2 v-2`) for the teeth.
  return `M${cx-r},${cy} a${r},${r} 0 1 0 ${r*2},0 a${r},${r} 0 1 0 -${r*2},0 M${cx+r},${cy} h6 v3 h-2 v-2`;
}

/**
 * Clear and redraw all relationship edges with their cardinality markers.
 * Called on initial render and after each entity drag.
 * @param {object} ast - ErdAST with up-to-date entity positions.
 * @param {SVGElement} edgeLayer - Group element to repopulate.
 * @param {boolean} curved - Whether to draw Bézier curves vs. orthogonal lines.
 * @returns {void}
 */
function redrawRelationships(ast, edgeLayer, curved) {
  edgeLayer.replaceChildren();
  const entityMap = new Map(ast.entities.map(e => [e.id, e]));

  ast.relationships.forEach((rel, idx) => {
    const A = entityMap.get(rel.from);
    const B = entityMap.get(rel.to);
    if (!A || !B) return;

    const aw = A.w ?? TABLE_W, bw = B.w ?? TABLE_W;
    const ay = A.y + (A.h ?? HEADER_H) / 2;
    const by = B.y + (B.h ?? HEADER_H) / 2;

    // Choose exit/entry sides from relative entity centers.
    const aRight = (B.x + bw / 2) >= (A.x + aw / 2);
    const ax   = aRight ? A.x + aw : A.x;
    const bx   = !aRight ? B.x + bw : B.x;
    const aDir = aRight ? 1 : -1;
    const bDir = !aRight ? 1 : -1;

    // `off` leaves room between the table edge and the line so the crow's-foot
    // cardinality markers can sit in the gap.
    const off = 10;
    const sx  = ax + aDir * off, ex = bx + bDir * off;

    const g = svgEl('g', { 'data-edge': idx, 'data-a': A.id, 'data-b': B.id });

    let d;
    if (curved) {
      const dx = Math.max(40, Math.abs(ex - sx) * 0.5);
      d = `M${sx},${ay} C${sx+aDir*dx},${ay} ${ex+bDir*dx},${by} ${ex},${by}`;
    } else {
      const mx = (sx + ex) / 2;
      d = `M${sx},${ay} L${mx},${ay} L${mx},${by} L${ex},${by}`;
    }

    // Non-identifying relationships (`..`) use a dashed line.
    g.appendChild(svgEl('path', { class: 'gm-edge', d, ...(rel.dashed ? { 'stroke-dasharray': '6,4' } : {}) }));

    drawCardinality(g, ax, ay, aDir, rel.fromCard ?? 'one', off);
    drawCardinality(g, bx, by, bDir, rel.toCard   ?? 'one', off);

    if (rel.label) {
      const mx = (sx + ex) / 2, my = (ay + by) / 2;
      g.appendChild(svgEl('rect', { x: mx-35, y: my-10, width: 70, height: 18, rx: 4, fill: 'var(--gm-panel)' }));
      g.appendChild(svgEl('text', { class: 'gm-edge-label', x: mx, y: my+4, 'text-anchor': 'middle' }, rel.label));
    }

    edgeLayer.appendChild(g);
  });
}

/**
 * Append crow's-foot cardinality markers at one endpoint of an edge. The glyph
 * nearest the entity shows the maximum (bar = one, crow's foot = many); the
 * glyph nearest the line shows the minimum (bar = one, circle = zero/optional).
 * @param {SVGGElement} g - The edge group to append marker lines to.
 * @param {number} x - X of the table edge at this endpoint.
 * @param {number} y - Y (vertical center) at this endpoint.
 * @param {number} dir - +1 if the line extends rightward, -1 if leftward.
 * @param {'one'|'zero-or-one'|'one-or-more'|'zero-or-more'} card - Cardinality to depict.
 * @param {number} [off=10] - Gap distance between table edge and line.
 * @returns {void}
 */
function drawCardinality(g, x, y, dir, card, off = 10) {
  const o = dir * off;
  const mark = a => g.appendChild(svgEl('line', { class: 'gm-edge-marker', ...a }));
  const bar  = t => mark({ x1: x + o * t, y1: y - 7, x2: x + o * t, y2: y + 7 });

  mark({ x1: x, y1: y, x2: x + o, y2: y }); // connecting stub

  // Maximum (nearest the entity): crow's foot for "many", a bar for "one".
  if (card.includes('more')) {
    const apex = x + o * 0.55;
    mark({ x1: apex, y1: y, x2: x, y2: y - 8 });
    mark({ x1: apex, y1: y, x2: x, y2: y });
    mark({ x1: apex, y1: y, x2: x, y2: y + 8 });
  } else {
    bar(0.45);
  }

  // Minimum (nearest the line): a hollow circle for "zero/optional", else a bar.
  if (card.startsWith('zero')) {
    g.appendChild(svgEl('circle', { class: 'gm-edge-marker', cx: x + o * 1.05, cy: y, r: 3.5, fill: 'var(--gm-bg)' }));
  } else {
    bar(1.0);
  }
}
