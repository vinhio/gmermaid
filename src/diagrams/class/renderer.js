/**
 * Class-diagram renderer: draws a ClassAST into SVG. Each class becomes a
 * three-compartment box (header / attributes / methods) appended to nodeLayer;
 * relationships become edges with UML markers appended to edgeLayer.
 */

import { svgEl } from '../../core/renderer.js';
import { connectBoxes } from '../../core/edges.js';

const CLASS_W    = 160; // minimum class box width (px); grows to fit content
const HEADER_H   = 44;  // header compartment height (px)
const SECTION_H  = 26;  // per-member row height (px)
const MIN_BODY_H = 20;  // minimum height of an empty attr/method compartment (px)
const MEMBER_PAD = 24;  // horizontal padding around the widest member line (px)

// Approx character widths (px) for the monospace var(--gm-font); used to size
// boxes to their content without measuring the live DOM.
const CW_NAME   = 8.5; // class name (13px, bold)
const CW_STEREO = 6.5; // «stereotype» (10px)
const CW_MEMBER = 6.9; // attribute/method rows (11px)

/**
 * Compute a class box width wide enough to fit its name, stereotype, and every
 * member line.
 * @param {object} cls - Class AST entry ({ name, generic, stereotype, attributes }).
 * @returns {number} The fitted width in px (>= CLASS_W).
 */
function classWidth(cls) {
  const nameStr = cls.generic ? `${cls.name}<${cls.generic}>` : cls.name;
  let w = nameStr.length * CW_NAME + MEMBER_PAD;
  if (cls.stereotype) w = Math.max(w, (cls.stereotype.length + 2) * CW_STEREO + MEMBER_PAD);
  for (const a of cls.attributes) w = Math.max(w, formatMember(a).length * CW_MEMBER + MEMBER_PAD);
  return Math.max(CLASS_W, Math.ceil(w));
}

/**
 * Render a class diagram AST into the given SVG layers.
 * @param {object} ast - ClassAST from parseClass ({ classes, relationships, notes }).
 * @param {SVGElement} nodeLayer - Group element that receives class boxes (and markers).
 * @param {SVGElement} edgeLayer - Group element that receives relationship edges.
 * @param {{ attachDrag: Function }} interact - Interaction helper for dragging.
 * @param {boolean} [curved=false] - Whether edges use Bézier curves (default orthogonal).
 * @returns {void}
 */
export function renderClass(ast, nodeLayer, edgeLayer, interact, curved = false) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();

  ensureMarkers(nodeLayer);

  // Compute each box's size: width fits content; height = header + attribute
  // compartment + separator (1px) + method compartment (empty ones clamped).
  for (const cls of ast.classes) {
    const attrs    = cls.attributes.filter(a => !a.isMethod);
    const methods  = cls.attributes.filter(a => a.isMethod);
    const attrH    = attrs.length   ? attrs.length   * SECTION_H + 8 : MIN_BODY_H;
    const methodH  = methods.length ? methods.length * SECTION_H + 8 : MIN_BODY_H;
    cls.w = classWidth(cls);
    cls.h = HEADER_H + attrH + 1 + methodH;
  }

  const classMap = new Map(ast.classes.map(c => [c.id, c]));
  const nsOf = classNamespaceMap(ast, classMap); // class id -> its namespace (or undefined)

  // Auto-layout once per parsed diagram: pack namespaces and free classes with
  // no overlap. Skipped if positions were restored from a saved layout.
  const anySaved = ast.classes.some(c => c.x !== 0 || c.y !== 0);
  if (!ast.__classLaidOut && !anySaved) layoutClasses(ast, classMap);
  ast.__classLaidOut = true;
  fitNamespaceBoxes(ast, classMap); // size each namespace box around its members

  // Split notes into those bound to a class (`note for X`) and floating ones.
  const notesByClass = new Map();
  const floatingNotes = [];
  for (const note of (ast.notes ?? [])) {
    if (note.forClass && classMap.has(note.forClass)) {
      if (!notesByClass.has(note.forClass)) notesByClass.set(note.forClass, []);
      notesByClass.get(note.forClass).push(note);
    } else {
      floatingNotes.push(note);
    }
  }

  // Tracks each class's rendered group so a namespace drag can move its members.
  const groupEls = {};
  const redraw = () => redrawEdges(ast, edgeLayer, curved);

  // Namespace frames (draggable by their header) — drawn first so they sit behind.
  for (const ns of (ast.namespaces ?? [])) {
    if (!ns.classes.some(id => classMap.has(id))) continue;
    nodeLayer.appendChild(buildNamespaceGroup(ns, classMap, groupEls, interact, redraw));
  }

  for (const cls of ast.classes) {
    const g = buildClassBox(cls);
    // Attach class-bound notes INSIDE the group so they (and their connector
    // line) drag along with the class via the group's transform.
    (notesByClass.get(cls.id) ?? []).forEach((note, idx) => g.appendChild(buildAttachedNote(cls, note, idx)));
    nodeLayer.appendChild(g);
    groupEls[cls.id] = g;

    // Classes inside a namespace are constrained to stay within its box.
    const ns = nsOf.get(cls.id);
    const constrain = ns ? (x, y) => clampInsideNamespace(ns, cls, x, y) : undefined;
    interact.attachDrag(g, cls, redraw, constrain);
  }

  // Floating notes (`note "..."` with no target) — fixed near the canvas origin.
  floatingNotes.forEach((note, idx) => nodeLayer.appendChild(buildFloatingNote(note, idx)));

  redraw();
}

// ─── Namespace layout & interaction ────────────────────────────────────────────

const NS_PAD   = 20;   // inner padding inside a namespace box (px)
const NS_LABEL = 26;   // namespace header/label band height (px)
const BLK_GAP  = 40;   // gap between top-level blocks (namespaces & free classes)
const CELL_GAP = 28;   // gap between classes packed inside a namespace
const ROW_MAX  = 1200; // wrap width for top-level block packing (px)

/**
 * Build a map of class id -> its namespace object (only for classes that belong
 * to a namespace).
 * @param {object} ast - ClassAST.
 * @param {Map<string, object>} classMap - Class id -> class lookup.
 * @returns {Map<string, object>} Class id -> namespace.
 */
function classNamespaceMap(ast, classMap) {
  const m = new Map();
  for (const ns of (ast.namespaces ?? [])) {
    for (const id of ns.classes) if (classMap.has(id)) m.set(id, ns);
  }
  return m;
}

/**
 * Pack members of a namespace into a near-square grid in LOCAL coordinates
 * (relative to the namespace origin), writing `_lx`/`_ly` on each, and return
 * the resulting content size.
 * @param {Array<object>} members - The namespace's class objects.
 * @returns {{ w: number, h: number }} Content width/height (incl. padding + label band).
 */
function gridMembers(members) {
  const cols = Math.max(1, Math.round(Math.sqrt(members.length)));
  let x = NS_PAD, y = NS_LABEL + NS_PAD, rowH = 0, col = 0, maxRight = 0, maxBottom = 0;
  for (const m of members) {
    m._lx = x; m._ly = y;
    maxRight = Math.max(maxRight, x + m.w);
    maxBottom = Math.max(maxBottom, y + m.h);
    x += m.w + CELL_GAP; rowH = Math.max(rowH, m.h);
    if (++col >= cols) { col = 0; x = NS_PAD; y += rowH + CELL_GAP; rowH = 0; }
  }
  return { w: maxRight + NS_PAD, h: maxBottom + NS_PAD };
}

/**
 * Deterministic, non-overlapping layout for a class diagram: each namespace is a
 * grid-packed block; namespaces and free classes are shelf-packed into rows.
 * Mutates class `x`/`y` (absolute positions).
 * @param {object} ast - ClassAST.
 * @param {Map<string, object>} classMap - Class id -> class lookup.
 * @returns {void}
 */
function layoutClasses(ast, classMap) {
  const inNs = new Set();
  const blocks = []; // { w, h, place(originX, originY) }

  for (const ns of (ast.namespaces ?? [])) {
    const members = ns.classes.map(id => classMap.get(id)).filter(Boolean);
    if (!members.length) continue;
    members.forEach(m => inNs.add(m.id));
    const size = gridMembers(members);
    blocks.push({ w: size.w, h: size.h, place: (ox, oy) => members.forEach(m => { m.x = ox + m._lx; m.y = oy + m._ly; }) });
  }
  for (const c of ast.classes) {
    if (inNs.has(c.id)) continue;
    blocks.push({ w: c.w, h: c.h, place: (ox, oy) => { c.x = ox; c.y = oy; } });
  }

  // Shelf packing: lay blocks left-to-right, wrapping when the row exceeds ROW_MAX.
  let x = 0, y = 0, rowH = 0;
  for (const b of blocks) {
    if (x > 0 && x + b.w > ROW_MAX) { x = 0; y += rowH + BLK_GAP; rowH = 0; }
    b.place(x, y);
    x += b.w + BLK_GAP;
    rowH = Math.max(rowH, b.h);
  }
}

/**
 * Size each namespace box to enclose its member classes (plus padding and a
 * label band). Recomputed every render so it tracks dragged members.
 * @param {object} ast - ClassAST.
 * @param {Map<string, object>} classMap - Class id -> class lookup.
 * @returns {void}
 */
function fitNamespaceBoxes(ast, classMap) {
  for (const ns of (ast.namespaces ?? [])) {
    const members = ns.classes.map(id => classMap.get(id)).filter(Boolean);
    if (!members.length) continue;
    ns.x = Math.min(...members.map(m => m.x)) - NS_PAD;
    ns.y = Math.min(...members.map(m => m.y)) - NS_LABEL - NS_PAD;
    ns.w = Math.max(...members.map(m => m.x + m.w)) + NS_PAD - ns.x;
    ns.h = Math.max(...members.map(m => m.y + m.h)) + NS_PAD - ns.y;
  }
}

/**
 * Clamp a proposed class position so the class stays inside its namespace box.
 * @param {object} ns - The namespace ({ x, y, w, h }).
 * @param {object} cls - The class being moved ({ w, h }).
 * @param {number} x - Proposed x.
 * @param {number} y - Proposed y.
 * @returns {{x: number, y: number}} The clamped position.
 */
function clampInsideNamespace(ns, cls, x, y) {
  const minX = ns.x + NS_PAD, maxX = ns.x + ns.w - NS_PAD - cls.w;
  const minY = ns.y + NS_LABEL, maxY = ns.y + ns.h - NS_PAD - cls.h;
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

/**
 * Build a draggable namespace frame: a dashed body outline plus a filled header
 * bar (the drag handle). Dragging the header moves the whole namespace and every
 * member class with it (member groups are translated via `groupEls`).
 * @param {object} ns - The namespace ({ name, classes, x, y, w, h }).
 * @param {Map<string, object>} classMap - Class id -> class lookup.
 * @param {Object<string, SVGGElement>} groupEls - Class id -> rendered group (filled in by the caller).
 * @param {{ attachDrag: Function }} interact - Interaction helper.
 * @param {() => void} redraw - Edge-redraw callback.
 * @returns {SVGGElement} The namespace group.
 */
function buildNamespaceGroup(ns, classMap, groupEls, interact, redraw) {
  const g = svgEl('g', { class: 'gm-class-namespace', 'data-id': `ns:${ns.name}`, transform: `translate(${ns.x},${ns.y})` });

  // Body outline (fill none → does not block clicks on the classes inside).
  g.appendChild(svgEl('rect', {
    x: 0, y: 0, width: ns.w, height: ns.h, rx: 8,
    fill: 'none', stroke: 'var(--gm-muted)', 'stroke-width': 1, 'stroke-dasharray': '6,4',
  }));
  // Header bar — the drag handle (filled, so it captures the pointer).
  const labelW = Math.min(ns.w, Math.max(60, ns.name.length * 7 + 24));
  g.appendChild(svgEl('rect', {
    class: 'gm-class-namespace-handle', x: 0, y: 0, width: labelW, height: NS_LABEL, rx: 8,
    fill: 'var(--gm-header)', stroke: 'var(--gm-muted)', 'stroke-width': 1,
  }));
  g.appendChild(svgEl('text', {
    x: 10, y: NS_LABEL / 2 + 4, fill: 'var(--gm-muted)',
    'font-family': 'var(--gm-font)', 'font-size': 11, 'font-weight': 700, 'pointer-events': 'none',
  }, ns.name));

  // Drag the namespace by its header: translate the frame and every member by
  // the same delta, then redraw edges.
  const nsState = { id: `ns:${ns.name}`, x: ns.x, y: ns.y };
  let lastX = ns.x, lastY = ns.y;
  interact.attachDrag(g, nsState, st => {
    const dx = st.x - lastX, dy = st.y - lastY;
    lastX = st.x; lastY = st.y;
    ns.x = st.x; ns.y = st.y;
    for (const id of ns.classes) {
      const c = classMap.get(id); if (!c) continue;
      c.x += dx; c.y += dy;
      groupEls[id]?.setAttribute('transform', `translate(${c.x},${c.y})`);
    }
    redraw();
  });

  return g;
}

/**
 * Measure a note's box size from its text lines.
 * @param {string[]} lines - The note's text lines.
 * @returns {{ w: number, h: number }} Box width and height in px.
 */
function noteSize(lines) {
  return { w: Math.max(90, ...lines.map(l => l.length * 6.5 + 16)), h: lines.length * 16 + 12 };
}

/**
 * Append the note box body (rect + text) to a group at the given top-left.
 * @param {SVGGElement} g - Group to append into.
 * @param {string[]} lines - Text lines.
 * @param {number} x - Box left.
 * @param {number} y - Box top.
 * @param {number} w - Box width.
 * @param {number} h - Box height.
 * @returns {void}
 */
function appendNoteBody(g, lines, x, y, w, h) {
  g.appendChild(svgEl('rect', {
    x, y, width: w, height: h, rx: 3,
    fill: 'var(--gm-header)', stroke: 'var(--gm-pk)', 'stroke-width': 1, 'stroke-dasharray': '3,2',
  }));
  const t = svgEl('text', {
    x: x + 8, y: y + 16, fill: 'var(--gm-muted)',
    'font-family': 'var(--gm-font)', 'font-size': 11, 'pointer-events': 'none',
  });
  lines.forEach((ln, idx) => t.appendChild(svgEl('tspan', { x: x + 8, dy: idx === 0 ? 0 : 16 }, ln)));
  g.appendChild(t);
}

/**
 * Build a note attached to a class, in the class group's LOCAL coordinates so it
 * tracks the class on drag. Sits to the right of the box with a dotted connector;
 * stacks downward when a class has multiple notes.
 * @param {object} cls - The target class (provides `w`/`h`).
 * @param {{ text: string }} note - The note.
 * @param {number} idx - Index among this class's notes (for vertical stacking).
 * @returns {SVGGElement} The note group (local to the class box origin).
 */
function buildAttachedNote(cls, note, idx) {
  const lines = note.text.split('\n');
  const { w, h } = noteSize(lines);
  const gap = 40;
  const lx = (cls.w ?? CLASS_W) + gap;   // local x: right of the box
  const ly = idx * (h + 12);             // stack multiple notes downward
  const cy = ly + h / 2;

  const g = svgEl('g', { class: 'gm-class-note' });
  // Dotted connector from the box's right edge to the note.
  g.appendChild(svgEl('line', {
    class: 'gm-class-note-link',
    x1: cls.w ?? CLASS_W, y1: Math.max(0, Math.min(cls.h ?? HEADER_H, cy)),
    x2: lx, y2: cy,
    stroke: 'var(--gm-pk)', 'stroke-width': 1, 'stroke-dasharray': '3,3',
  }));
  appendNoteBody(g, lines, lx, ly, w, h);
  return g;
}

/**
 * Build a floating note (no target class) placed near the top-left of the canvas.
 * @param {{ text: string }} note - The note.
 * @param {number} idx - Index among floating notes (for vertical stacking).
 * @returns {SVGGElement} The note group.
 */
function buildFloatingNote(note, idx) {
  const lines = note.text.split('\n');
  const { w, h } = noteSize(lines);
  const g = svgEl('g', { class: 'gm-class-note' });
  appendNoteBody(g, lines, -40, -40 + idx * (h + 12), w, h);
  return g;
}

/**
 * Build a class box `<g>`: background, header (optional stereotype + name),
 * and the attribute and method compartments separated by lines.
 * @param {object} cls - Class AST entry (with computed `w`/`h`).
 * @returns {SVGGElement} The positioned class group.
 */
function buildClassBox(cls) {
  const { id, name, stereotype, attributes, w, h } = cls;
  const attrs   = attributes.filter(a => !a.isMethod);
  const methods = attributes.filter(a => a.isMethod);
  const attrH   = attrs.length   ? attrs.length   * SECTION_H + 8 : MIN_BODY_H;

  const g = svgEl('g', { class: 'gm-class-node', 'data-id': id, transform: `translate(${cls.x},${cls.y})` });

  // Background
  g.appendChild(svgEl('rect', { class: 'gm-class-bg', x: 0, y: 0, width: w, height: h, rx: 8 }));

  // Header background
  g.appendChild(svgEl('rect', { class: 'gm-class-header', x: 1, y: 1, width: w - 2, height: HEADER_H - 1, rx: 7 }));

  // Stereotype line sits above the name; if present, nudge the name down.
  let nameY = HEADER_H / 2 + 6;
  if (stereotype) {
    nameY = HEADER_H / 2 + 10;
    g.appendChild(svgEl('text', {
      class: 'gm-class-stereo',
      x: w / 2, y: HEADER_H / 2 - 6,
      'text-anchor': 'middle',
    }, `«${stereotype}»`));
  }

  // Class name (with generic/template parameter rendered as Name<T>)
  g.appendChild(svgEl('text', {
    class: 'gm-class-name',
    x: w / 2, y: nameY,
    'text-anchor': 'middle',
  }, cls.generic ? `${name}<${cls.generic}>` : name));

  // Separator line 1 (header / attrs)
  g.appendChild(svgEl('line', { class: 'gm-class-sep', x1: 0, y1: HEADER_H, x2: w, y2: HEADER_H }));

  // Attributes — one text row each, vertically centered within its SECTION_H slot.
  attrs.forEach((a, i) => {
    const y = HEADER_H + 6 + i * SECTION_H + SECTION_H / 2 + 4;
    g.appendChild(svgEl('text', { class: 'gm-class-attr', x: 10, y }, formatMember(a)));
  });

  // Separator line 2 (attrs / methods)
  const sepY = HEADER_H + attrH;
  g.appendChild(svgEl('line', { class: 'gm-class-sep', x1: 0, y1: sepY, x2: w, y2: sepY }));

  // Methods
  methods.forEach((m, i) => {
    const y = sepY + 6 + i * SECTION_H + SECTION_H / 2 + 4;
    g.appendChild(svgEl('text', { class: 'gm-class-method', x: 10, y }, formatMember(m)));
  });

  return g;
}

/**
 * Format a member into its UML text line (e.g. `+save(id): bool`).
 * @param {object} m - Member entry ({ visibility, name, type, isMethod, isAbstract, params }).
 * @returns {string} The formatted member string.
 */
function formatMember(m) {
  const vis = { public: '+', private: '-', protected: '#', package: '~', static: '$' }[m.visibility] ?? '';
  if (m.isMethod) {
    const ret = m.type && m.type !== 'void' ? `: ${m.type}` : '';
    const abs = m.isAbstract ? '*' : '';
    return `${vis}${m.name}(${m.params ?? ''})${abs}${ret}`;
  }
  return m.type ? `${vis}${m.name}: ${m.type}` : `${vis}${m.name}`;
}

/**
 * Clear and redraw all relationship edges with their UML markers and labels.
 * Called on initial render and after each class drag.
 * @param {object} ast - ClassAST with up-to-date class positions.
 * @param {SVGElement} edgeLayer - Group element to repopulate.
 * @param {boolean} curved - Whether to draw Bézier curves vs. orthogonal lines.
 * @returns {void}
 */
function redrawEdges(ast, edgeLayer, curved) {
  edgeLayer.replaceChildren();
  const classMap = new Map(ast.classes.map(c => [c.id, c]));

  for (const rel of ast.relationships) {
    const a = classMap.get(rel.from);
    const b = classMap.get(rel.to);
    if (!a || !b) continue;

    // Four-sided routing: anchor each end to the box side facing the other class.
    const A = { x: a.x, y: a.y, w: a.w ?? CLASS_W, h: a.h ?? HEADER_H };
    const B = { x: b.x, y: b.y, w: b.w ?? CLASS_W, h: b.h ?? HEADER_H };
    const { d, p1, p2, mx, my } = connectBoxes(A, B, curved);

    const g = svgEl('g', { class: 'gm-class-edge', 'data-from': rel.from, 'data-to': rel.to });

    // Markers are placed per end: the start head at `from`, the end head at `to`.
    const pathAttrs = { class: 'gm-class-edge-path', d, fill: 'none', stroke: 'var(--gm-edge)', 'stroke-width': '1.5' };
    if (rel.dashed) pathAttrs['stroke-dasharray'] = '6,4';
    const startMarker = headMarker(rel.startHead);
    const endMarker   = headMarker(rel.endHead);
    if (startMarker) pathAttrs['marker-start'] = startMarker;
    if (endMarker)   pathAttrs['marker-end']   = endMarker;
    g.appendChild(svgEl('path', pathAttrs));

    // Multiplicity labels — nudged outward along each anchor's side normal,
    // with horizontal alignment chosen from the normal's x component.
    const multAnchor = nx => nx > 0 ? 'start' : nx < 0 ? 'end' : 'middle';
    if (rel.fromLabel) {
      g.appendChild(svgEl('text', { class: 'gm-class-mult', x: p1.x + p1.nx * 14, y: p1.y + p1.ny * 14 - 6, 'text-anchor': multAnchor(p1.nx) }, rel.fromLabel));
    }
    if (rel.toLabel) {
      g.appendChild(svgEl('text', { class: 'gm-class-mult', x: p2.x + p2.nx * 14, y: p2.y + p2.ny * 14 - 6, 'text-anchor': multAnchor(p2.nx) }, rel.toLabel));
    }
    if (rel.label) {
      g.appendChild(svgEl('text', { class: 'gm-edge-label', x: mx, y: my - 6, 'text-anchor': 'middle' }, rel.label));
    }

    edgeLayer.appendChild(g);
  }
}

/**
 * Map a relationship end-head kind to its SVG marker URL.
 * @param {string|null} head - Head kind ('triangle' | 'arrow' | 'diamondF' | 'diamondH') or null.
 * @returns {string|null} A `url(#...)` marker reference, or null for no head.
 */
function headMarker(head) {
  switch (head) {
    case 'triangle': return 'url(#gm-cls-inherit)';   // hollow triangle (inheritance/realization)
    case 'arrow':    return 'url(#gm-cls-arrow)';      // open arrow (association/dependency)
    case 'diamondF': return 'url(#gm-cls-compose)';    // filled diamond (composition)
    case 'diamondH': return 'url(#gm-cls-aggregate)';  // hollow diamond (aggregation)
    default:         return null;
  }
}

/**
 * Inject the shared UML arrowhead/diamond markers into the SVG's defs once.
 * No-op if they already exist or no parent SVG is found.
 * @param {SVGElement} nodeLayer - A layer whose owning SVG receives the markers.
 * @returns {void}
 */
function ensureMarkers(nodeLayer) {
  const svg = nodeLayer.closest('svg') ?? nodeLayer.ownerSVGElement;
  if (!svg || svg.querySelector('#gm-cls-inherit')) return;

  let defs = svg.querySelector('defs');
  if (!defs) { defs = svgEl('defs'); svg.insertBefore(defs, svg.firstChild); }

  // Hollow triangle (inheritance / realization) — points right
  // Hollow triangle (inheritance / realization). `auto-start-reverse` lets it
  // serve as either the start head (`<|--`) or the end head (`--|>` / `..|>`).
  const inherit = svgEl('marker', { id: 'gm-cls-inherit', markerWidth: 14, markerHeight: 10, refX: 14, refY: 5, orient: 'auto-start-reverse' });
  inherit.appendChild(svgEl('path', { d: 'M0,0 L14,5 L0,10 Z', fill: 'var(--gm-panel)', stroke: 'var(--gm-edge)', 'stroke-width': '1.5' }));
  defs.appendChild(inherit);

  // Open arrowhead (association / dependency); usable at either end.
  const arrow = svgEl('marker', { id: 'gm-cls-arrow', markerWidth: 11, markerHeight: 8, refX: 10, refY: 4, orient: 'auto-start-reverse' });
  arrow.appendChild(svgEl('path', { d: 'M0,0 L10,4 L0,8', fill: 'none', stroke: 'var(--gm-edge)', 'stroke-width': '1.5' }));
  defs.appendChild(arrow);

  // Filled diamond (composition) — points toward source
  const compose = svgEl('marker', { id: 'gm-cls-compose', markerWidth: 16, markerHeight: 10, refX: 0, refY: 5, orient: 'auto-start-reverse' });
  compose.appendChild(svgEl('path', { d: 'M0,5 L8,0 L16,5 L8,10 Z', fill: 'var(--gm-edge)' }));
  defs.appendChild(compose);

  // Hollow diamond (aggregation)
  const aggregate = svgEl('marker', { id: 'gm-cls-aggregate', markerWidth: 16, markerHeight: 10, refX: 0, refY: 5, orient: 'auto-start-reverse' });
  aggregate.appendChild(svgEl('path', { d: 'M0,5 L8,0 L16,5 L8,10 Z', fill: 'var(--gm-panel)', stroke: 'var(--gm-edge)', 'stroke-width': '1.5' }));
  defs.appendChild(aggregate);
}
