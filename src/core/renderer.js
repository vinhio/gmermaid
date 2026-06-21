/**
 * renderer.js — builds and owns the SVG scaffold every diagram draws into.
 *
 * Sets up the fixed stage/viewport structure of the pipeline's render stage:
 * an outer <svg> "stage" (which Interact pans/zooms via a transform on the
 * inner viewport), a shared <defs> block (dotted grid pattern + arrow
 * markers), and two layer groups — edgeLayer (drawn first, underneath) and
 * nodeLayer (drawn on top). Diagram-specific renderers populate these layers;
 * the structure here never changes between diagram types.
 */
const NS = 'http://www.w3.org/2000/svg';

/**
 * Create an SVG element in the SVG namespace with the given attributes/text.
 * @param {string} tag - SVG tag name, e.g. 'g', 'path', 'rect'.
 * @param {Record<string, string|number>} [attrs={}] - Attributes to set.
 * @param {string|null} [text=null] - Optional text content for the element.
 * @returns {SVGElement} The constructed SVG element.
 */
export function svgEl(tag, attrs = {}, text = null) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== null) n.textContent = text;
  return n;
}

/**
 * Renderer — constructs the persistent SVG stage and exposes its layers.
 */
export class Renderer {
  container;   // host element the stage is appended to
  stage;       // outer <svg> element (handles pan/zoom & pointer events)
  viewport;    // <g> transformed by Interact; holds grid + layers
  edgeLayer;   // <g> for edges/links (rendered beneath nodes)
  nodeLayer;   // <g> for node/shape elements (rendered above edges)

  /**
   * @param {HTMLElement} container - Element to render the diagram into.
   */
  constructor(container) {
    this.container = container;
    container.classList.add('gm-container');
    this.#build();
  }

  /**
   * Build the SVG scaffold: stage, defs (grid pattern + arrow markers),
   * viewport with background grid, and the edge/node layers.
   * @returns {void}
   */
  #build() {
    this.stage = svgEl('svg', { class: 'gm-stage', xmlns: NS });

    const defs = svgEl('defs');

    const gridPat = svgEl('pattern', { id: 'gm-grid', width: '28', height: '28', patternUnits: 'userSpaceOnUse' });
    gridPat.appendChild(svgEl('circle', { cx: '1', cy: '1', r: '1', fill: 'var(--gm-grid)' }));
    defs.appendChild(gridPat);

    // Default arrow marker
    const mkr = svgEl('marker', { id: 'gm-arrow', markerWidth: '10', markerHeight: '7', refX: '10', refY: '3.5', orient: 'auto' });
    mkr.appendChild(svgEl('path', { d: 'M0,0 L10,3.5 L0,7 Z', fill: 'var(--gm-edge)' }));
    defs.appendChild(mkr);

    // Highlighted arrow marker
    const mkrHi = svgEl('marker', { id: 'gm-arrow-hi', markerWidth: '10', markerHeight: '7', refX: '10', refY: '3.5', orient: 'auto' });
    mkrHi.appendChild(svgEl('path', { d: 'M0,0 L10,3.5 L0,7 Z', fill: 'var(--gm-edge-hi)' }));
    defs.appendChild(mkrHi);

    this.stage.appendChild(defs);

    // Viewport: the single <g> that Interact translates/scales. A large
    // grid-filled rect gives the illusion of an infinite dotted background.
    this.viewport = svgEl('g', { id: 'gm-viewport' });
    this.viewport.appendChild(svgEl('rect', {
      x: '-5000', y: '-5000', width: '10000', height: '10000', fill: 'url(#gm-grid)',
    }));

    this.edgeLayer = svgEl('g', { class: 'gm-edge-layer' });
    this.nodeLayer = svgEl('g', { class: 'gm-node-layer' });
    this.viewport.appendChild(this.edgeLayer);
    this.viewport.appendChild(this.nodeLayer);
    this.stage.appendChild(this.viewport);

    this.container.appendChild(this.stage);
  }

  /**
   * Empty both layers, removing all previously rendered nodes and edges.
   * @returns {void}
   */
  clear() {
    this.edgeLayer.replaceChildren();
    this.nodeLayer.replaceChildren();
  }

  /**
   * Remove the entire stage from the DOM.
   * @returns {void}
   */
  destroy() {
    this.stage.remove();
  }
}
