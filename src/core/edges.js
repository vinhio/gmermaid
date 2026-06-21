/**
 * @file Four-sided edge anchoring shared by box-based diagram renderers
 * (flowchart, class, state, architecture).
 *
 * Box renderers historically left every node from its left or right side, so a
 * top-to-bottom layout connected awkwardly side-to-side. These helpers instead
 * pick the side (top / right / bottom / left) of each box that faces the other
 * box, and route the edge so it leaves and arrives perpendicular to the chosen
 * side — the same smooth-connector idea used by the mindmap renderer, but with
 * the anchor side selected per pair instead of fixed to the horizontal axis.
 */

/** Outward unit normal for each box side. @type {Object<string,{nx:number,ny:number}>} */
const NORMAL = {
  L: { nx: -1, ny:  0 },
  R: { nx:  1, ny:  0 },
  T: { nx:  0, ny: -1 },
  B: { nx:  0, ny:  1 },
};

/**
 * Pick the box side an edge should use to point in direction (dx, dy).
 * Uses a horizontal side (L/R) when the horizontal gap dominates, otherwise a
 * vertical side (T/B), so the chosen side always faces the other box.
 * @param {number} dx - Horizontal delta toward the other box's center.
 * @param {number} dy - Vertical delta toward the other box's center.
 * @returns {'L'|'R'|'T'|'B'} The facing side.
 */
export function sideToward(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'R' : 'L';
  return dy >= 0 ? 'B' : 'T';
}

/**
 * Compute the anchor point and outward normal on one side of a box.
 * @param {{x:number, y:number, w:number, h:number}} box - Box geometry (top-left origin).
 * @param {'L'|'R'|'T'|'B'} side - Which side to anchor to.
 * @returns {{x:number, y:number, nx:number, ny:number, side:string}} Anchor point + outward normal.
 */
export function anchorPoint(box, side) {
  const { nx, ny } = NORMAL[side] ?? NORMAL.R;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  // Walk from the box center out to the midpoint of the chosen side.
  return { x: cx + nx * box.w / 2, y: cy + ny * box.h / 2, nx, ny, side };
}

/**
 * Choose the facing side of each box and return both anchor points.
 * @param {{x:number, y:number, w:number, h:number}} a - Source box.
 * @param {{x:number, y:number, w:number, h:number}} b - Target box.
 * @returns {{p1: object, p2: object}} Anchors on a and b (each from {@link anchorPoint}).
 */
export function facingAnchors(a, b) {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
  const dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  return {
    p1: anchorPoint(a, sideToward( dx,  dy)),
    p2: anchorPoint(b, sideToward(-dx, -dy)),
  };
}

/**
 * Build an SVG path `d` between two anchors, leaving each end perpendicular to
 * its box side.
 * @param {{x:number, y:number, nx:number, ny:number}} p1 - Source anchor + normal.
 * @param {{x:number, y:number, nx:number, ny:number}} p2 - Target anchor + normal.
 * @param {boolean} [curved=true] - Cubic bezier when true, orthogonal step when false.
 * @returns {string} The path `d` attribute.
 */
export function edgePath(p1, p2, curved = true) {
  if (curved) {
    // Push each control point out along its side's normal so the curve leaves
    // perpendicular to the box; scale the offset with edge length.
    const off = Math.max(40, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.4);
    const c1x = p1.x + p1.nx * off, c1y = p1.y + p1.ny * off;
    const c2x = p2.x + p2.nx * off, c2y = p2.y + p2.ny * off;
    return `M${p1.x},${p1.y} C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  // Orthogonal: pivot on the midpoint of whichever axis the source side faces.
  if (p1.nx !== 0) {
    const mx = (p1.x + p2.x) / 2;
    return `M${p1.x},${p1.y} L${mx},${p1.y} L${mx},${p2.y} L${p2.x},${p2.y}`;
  }
  const my = (p1.y + p2.y) / 2;
  return `M${p1.x},${p1.y} L${p1.x},${my} L${p2.x},${my} L${p2.x},${p2.y}`;
}

/**
 * Compute a complete four-sided connector between two boxes: the facing-side
 * anchors, the path string, and a label midpoint.
 * @param {{x:number, y:number, w:number, h:number}} a - Source box.
 * @param {{x:number, y:number, w:number, h:number}} b - Target box.
 * @param {boolean} [curved=true] - Curved vs. orthogonal routing.
 * @returns {{d:string, p1:object, p2:object, mx:number, my:number}} Connector geometry.
 */
export function connectBoxes(a, b, curved = true) {
  const { p1, p2 } = facingAnchors(a, b);
  return {
    d:  edgePath(p1, p2, curved),
    p1, p2,
    mx: (p1.x + p2.x) / 2,
    my: (p1.y + p2.y) / 2,
  };
}
