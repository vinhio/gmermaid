/**
 * VirtualRenderer — post-render DOM culling for large diagrams.
 *
 * After the main renderer populates nodeLayer with ALL node elements,
 * VirtualRenderer takes over: it removes off-screen nodes from the DOM
 * and re-inserts them when they scroll into view. This keeps the active
 * DOM small without requiring renderer changes.
 *
 * Usage:
 *   const vr = new VirtualRenderer(nodeLayer, nodes, bus);
 *   vr.refresh(view); // call once after initial render
 */
export class VirtualRenderer {
  #nodeLayer;            // <g> layer whose children are culled in/out
  #nodes    = [];        // AST nodes (each carries x/y and optional w/h)
  #pool     = new Map(); // id → element (may be detached from the DOM)
  #visible  = new Set(); // ids currently attached to the DOM
  #margin   = 400; // world-unit buffer around viewport
  #unsub;                // bus unsubscribe function for 'viewChange'

  /**
   * Take over a freshly-rendered node layer for off-screen culling.
   * @param {SVGGElement} nodeLayer - Layer containing all rendered node elements.
   * @param {Array<{id: string, x: number, y: number, w?: number, h?: number}>} nodes - AST nodes.
   * @param {import('./events.js').EventBus} bus - Bus emitting 'viewChange'.
   */
  constructor(nodeLayer, nodes, bus) {
    this.#nodeLayer = nodeLayer;
    this.#nodes = nodes;

    // Collect elements created by the main renderer
    for (const n of nodes) {
      const el = nodeLayer.querySelector(`[data-id="${CSS.escape(n.id)}"]`);
      if (el) {
        this.#pool.set(n.id, el);
        this.#visible.add(n.id);
      }
    }

    // Subscribe to viewport changes
    this.#unsub = bus.on('viewChange', view => this.#updateFromView(view));
  }

  /**
   * Compute visible world bounds from Interact's view { x:tx, y:ty, k:scale }
   * and the stage client size.
   */
  refresh(view, stageW, stageH) {
    this.#updateFromView(view, stageW, stageH);
  }

  /**
   * Recompute which nodes fall within the (buffered) viewport and sync the DOM.
   * @param {{x: number, y: number, k: number}} view - Interact view transform:
   *   x/y are the viewport translation, k the scale factor.
   * @param {number} [stageW] - Stage width in px; defaults to the SVG client width.
   * @param {number} [stageH] - Stage height in px; defaults to the SVG client height.
   * @returns {void}
   */
  #updateFromView(view, stageW, stageH) {
    const { x: tx, y: ty, k } = view;
    // Stage size may not be passed on bus events; use stored or default
    const sw = stageW ?? this.#nodeLayer.ownerSVGElement?.clientWidth  ?? 800;
    const sh = stageH ?? this.#nodeLayer.ownerSVGElement?.clientHeight ?? 600;

    // Invert the view transform to get the visible region in world units:
    // a screen point p maps to world (p - translate) / scale.
    const wx = -tx / k;
    const wy = -ty / k;
    const ww =  sw / k;
    const wh =  sh / k;

    const buf = this.#margin;
    const newVisible = new Set();

    // A node is culled only when its box lies entirely outside the buffered
    // viewport rect; the margin keeps a ring of nodes ready just off-screen.
    for (const n of this.#nodes) {
      const nw = n.w ?? 140, nh = n.h ?? 44;
      if (n.x + nw < wx - buf || n.x > wx + ww + buf ||
          n.y + nh < wy - buf || n.y > wy + wh + buf) continue;
      newVisible.add(n.id);
    }

    // Remove no-longer-visible nodes
    for (const id of this.#visible) {
      if (!newVisible.has(id)) {
        this.#pool.get(id)?.remove();
        this.#visible.delete(id);
      }
    }
    // Insert newly-visible nodes
    for (const id of newVisible) {
      if (!this.#visible.has(id)) {
        const el = this.#pool.get(id);
        if (el) { this.#nodeLayer.appendChild(el); this.#visible.add(id); }
      }
    }
  }

  /**
   * Unsubscribe from the bus and release pooled element references.
   * @returns {void}
   */
  destroy() {
    this.#unsub?.();
    this.#pool.clear();
    this.#visible.clear();
  }
}
