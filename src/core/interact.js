/**
 * interact.js — the interactive layer of the render pipeline.
 *
 * Turns the static SVG produced by the renderers into an interactive surface:
 * wheel/drag panning, zoom, fit-to-content, node dragging (with optional
 * snap-to-grid) and double-click inline label editing. The current camera is
 * a single view transform `{ x, y, k }` (translation x/y, scale k) applied to
 * the renderer's viewport <g>; every change is broadcast on the bus as
 * 'viewChange' so dependents (e.g. VirtualRenderer) can react. Node moves and
 * label edits emit 'nodeMove' / 'labelEdit' for the Diagram to record in
 * History.
 */
export class Interact {
  #stage;                          // outer <svg> capturing pointer/wheel input
  #viewport;                       // <g> the view transform is written to
  #view     = { x: 40, y: 40, k: 1 }; // camera: translate (x,y) + scale (k)
  #panning  = false;               // whether a background pan is in progress
  #panStart = null;                // pointer-vs-view offset captured at pan start
  #bus;                            // EventBus for view/node/label events
  #snapGrid = 0;                   // grid pitch for drag snapping (0 = off)

  /**
   * @param {SVGSVGElement} stage - Outer SVG that receives pointer/wheel events.
   * @param {SVGGElement} viewport - Group transformed for pan/zoom.
   * @param {import('./events.js').EventBus} bus - Bus for interaction events.
   */
  constructor(stage, viewport, bus) {
    this.#stage    = stage;
    this.#viewport = viewport;
    this.#bus      = bus;
    this.#attachStage();
  }

  /** @param {number|string} v - Grid pitch in world units; 0/NaN disables snapping. */
  set snapGrid(v) { this.#snapGrid = Number(v) || 0; }
  /** @returns {number} Current snap grid pitch (0 = disabled). */
  get snapGrid()  { return this.#snapGrid; }

  /**
   * Snap a coordinate to the nearest grid line when snapping is enabled.
   * @param {number} v - World-space coordinate.
   * @returns {number} Snapped coordinate, or v unchanged when grid is 0.
   */
  #snap(v) {
    const g = this.#snapGrid;
    return g > 0 ? Math.round(v / g) * g : v;
  }

  /**
   * Clamp a value to the inclusive range [a, b].
   * @param {number} v - Value to clamp.
   * @param {number} a - Lower bound.
   * @param {number} b - Upper bound.
   * @returns {number} The clamped value.
   */
  #clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /**
   * Convert client (screen) coordinates into viewport/world coordinates by
   * inverting the viewport's current screen CTM.
   * @param {number} clientX - Pointer x in client space.
   * @param {number} clientY - Pointer y in client space.
   * @returns {SVGPoint} The corresponding point in world space.
   */
  screenToWorld(clientX, clientY) {
    const pt = this.#stage.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(this.#viewport.getScreenCTM().inverse());
  }

  /**
   * Write the current view transform onto the viewport and broadcast it.
   * @returns {void}
   */
  applyView() {
    const { x, y, k } = this.#view;
    this.#viewport.setAttribute('transform', `translate(${x},${y}) scale(${k})`);
    this.#bus.emit('viewChange', { ...this.#view });
  }

  /**
   * Zoom by a factor while keeping the point under (cx, cy) fixed on screen.
   * @param {number} cx - Anchor x in client coordinates.
   * @param {number} cy - Anchor y in client coordinates.
   * @param {number} factor - Multiplier applied to the current scale.
   * @returns {void}
   */
  zoomAt(cx, cy, factor) {
    const nk = this.#clamp(this.#view.k * factor, 0.1, 5);
    const r  = this.#stage.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    // Re-solve the translation so the world point under the cursor stays put
    // as the scale changes from k to nk.
    this.#view.x = px - (px - this.#view.x) * (nk / this.#view.k);
    this.#view.y = py - (py - this.#view.y) * (nk / this.#view.k);
    this.#view.k = nk;
    this.applyView();
  }

  /**
   * Zoom in by 20%, centred on the stage.
   * @returns {void}
   */
  zoomIn() {
    const r = this.#stage.getBoundingClientRect();
    this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2);
  }

  /**
   * Zoom out by 20%, centred on the stage.
   * @returns {void}
   */
  zoomOut() {
    const r = this.#stage.getBoundingClientRect();
    this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2);
  }

  /**
   * Scale and centre the view so the bounding box of all nodes fits the stage.
   * @param {Array<{x: number, y: number, w?: number, h?: number}>} nodes - Nodes to frame.
   * @returns {void}
   */
  fitToContent(nodes) {
    if (!nodes.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + (n.w ?? 140));
      maxY = Math.max(maxY, n.y + (n.h ?? 44));
    }
    const pad = 60;  // padding around content, in world units
    const r   = this.#stage.getBoundingClientRect();
    const w   = maxX - minX + pad * 2;
    const h   = maxY - minY + pad * 2;
    // Scale to whichever axis is the tighter fit, then translate so the padded
    // content box is centred within the stage.
    this.#view.k = this.#clamp(Math.min(r.width / w, r.height / h), 0.1, 5);
    this.#view.x = (r.width  - w * this.#view.k) / 2 - (minX - pad) * this.#view.k;
    this.#view.y = (r.height - h * this.#view.k) / 2 - (minY - pad) * this.#view.k;
    this.applyView();
  }

  /** @returns {number} Current zoom scale factor (k). */
  get zoom() { return this.#view.k; }

  /**
   * Pan the view by a screen-space delta.
   * @param {number} dx - Horizontal shift in pixels.
   * @param {number} dy - Vertical shift in pixels.
   * @returns {void}
   */
  panBy(dx, dy) {
    this.#view.x += dx;
    this.#view.y += dy;
    this.applyView();
  }

  /**
   * Wire up stage-level pointer/wheel handlers for background pan and zoom.
   * Pointer events that originate on a draggable node are ignored here so node
   * dragging (attachDrag) takes precedence.
   * @returns {void}
   */
  #attachStage() {
    this.#stage.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    this.#stage.addEventListener('pointerdown', e => {
      if (e.target.closest('[data-draggable]')) return; // let node drag handle it
      this.#panning  = true;
      this.#stage.classList.add('gm-panning');
      // Store pointer-minus-view so pointermove can recompute view directly.
      this.#panStart = { x: e.clientX - this.#view.x, y: e.clientY - this.#view.y };
      this.#stage.setPointerCapture(e.pointerId);
    });

    this.#stage.addEventListener('pointermove', e => {
      if (!this.#panning) return;
      this.#view.x = e.clientX - this.#panStart.x;
      this.#view.y = e.clientY - this.#panStart.y;
      this.applyView();
    });

    const endPan = () => {
      this.#panning = false;
      this.#stage.classList.remove('gm-panning');
    };
    this.#stage.addEventListener('pointerup',     endPan);
    this.#stage.addEventListener('pointercancel', endPan);
  }

  /**
   * Make a node element draggable, updating nodeState.x/y and emitting
   * 'nodeMove' (with the original position) when the drag ends.
   * @param {SVGElement} element - The node element to make draggable.
   * @param {{id: string, x: number, y: number}} nodeState - Mutable node position state.
   * @param {(nodeState: object) => void} [onMove] - Optional per-move callback (e.g. to redraw edges).
   * @param {(x: number, y: number) => {x: number, y: number}} [constrain] - Optional clamp applied to the proposed position (e.g. to keep a node inside its namespace).
   * @returns {void}
   */
  attachDrag(element, nodeState, onMove, constrain) {
    let start = null, orig = null;  // pointer world-origin and node origin at drag start
    element.setAttribute('data-draggable', '1');

    element.addEventListener('pointerdown', e => {
      if (e.detail >= 2) return; // allow dblclick to pass through
      e.stopPropagation();
      element.classList.add('gm-dragging');
      element.parentNode?.appendChild(element); // raise to top of paint order
      start = this.screenToWorld(e.clientX, e.clientY);
      orig  = { x: nodeState.x, y: nodeState.y };
      element.setPointerCapture(e.pointerId);
    });

    element.addEventListener('pointermove', e => {
      if (!start) return;
      // Translate node by the world-space pointer delta, snap to grid, then
      // apply any caller constraint (e.g. clamp inside a namespace).
      const p = this.screenToWorld(e.clientX, e.clientY);
      let nx = this.#snap(orig.x + (p.x - start.x));
      let ny = this.#snap(orig.y + (p.y - start.y));
      if (constrain) ({ x: nx, y: ny } = constrain(nx, ny));
      nodeState.x = nx;
      nodeState.y = ny;
      element.setAttribute('transform', `translate(${nodeState.x},${nodeState.y})`);
      onMove?.(nodeState);
    });

    // On release, emit the move so the Diagram can record it in History;
    // `from` preserves the pre-drag position for undo.
    const end = e => {
      if (!start) return;
      const from = { ...orig };
      start = null;
      element.classList.remove('gm-dragging');
      try { element.releasePointerCapture(e.pointerId); } catch (_) {}
      this.#bus.emit('nodeMove', {
        id: nodeState.id,
        x: nodeState.x, y: nodeState.y,
        from,
        nodeState,
      });
    };
    element.addEventListener('pointerup',     end);
    element.addEventListener('pointercancel', end);
  }

  /**
   * Double-click inline label editor — overlays a native <input> positioned
   * over the node; commits on Enter/blur and emits 'labelEdit', cancels on Escape.
   * @param {SVGElement} element - The node element to edit on double-click.
   * @param {{id: string, label?: string, name?: string}} nodeState - Mutable node label state.
   * @returns {void}
   */
  attachLabelEdit(element, nodeState) {
    element.addEventListener('dblclick', e => {
      e.stopPropagation();
      e.preventDefault();

      const rect     = element.getBoundingClientRect();
      const oldLabel = nodeState.label ?? nodeState.name ?? '';

      const input = document.createElement('input');
      input.type  = 'text';
      input.value = oldLabel;

      Object.assign(input.style, {
        position:     'fixed',
        left:         `${rect.left + 4}px`,
        top:          `${rect.top  + 4}px`,
        width:        `${Math.max(rect.width - 8, 60)}px`,
        height:       `${Math.max(rect.height - 8, 24)}px`,
        font:         "12px 'Sora', system-ui, sans-serif",
        textAlign:    'center',
        background:   '#161b22',
        color:        '#e6edf3',
        border:       '2px solid #3fb950',
        borderRadius: '8px',
        outline:      'none',
        zIndex:       '9999',
        padding:      '4px',
        boxSizing:    'border-box',
      });

      document.body.appendChild(input);
      input.focus();
      input.select();

      // Apply the edited value: ignore no-ops, otherwise update node state and
      // emit 'labelEdit' (with the old label) for History.
      const commit = () => {
        if (!input.isConnected) return;
        const newLabel = input.value.trim() || oldLabel;
        input.remove();
        if (newLabel === oldLabel) return;
        nodeState.label = newLabel;
        nodeState.name  = newLabel;
        this.#bus.emit('labelEdit', {
          id: nodeState.id,
          label: newLabel,
          oldLabel,
          nodeState,
        });
      };

      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter')  commit();
        if (ev.key === 'Escape') input.remove();
        ev.stopPropagation();
      });
      input.addEventListener('blur', commit);
    });
  }
}
