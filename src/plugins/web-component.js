/**
 * gMermaid — <g-diagram> Web Component
 *
 * Usage:
 *   <script type="module" src="gmermaid/src/plugins/web-component.js"></script>
 *
 *   <g-diagram theme="dark" height="400px">
 *     flowchart LR
 *       A[Start] --> B[End]
 *   </g-diagram>
 *
 * Or with src attribute:
 *   <g-diagram src="./diagram.mmd" theme="light" height="300px"></g-diagram>
 *
 * Attributes:
 *   src      — URL of a .mmd file (fetched on connect)
 *   theme    — 'dark' | 'light' | 'github' (default: 'dark')
 *   height   — CSS height of the element (default: '400px')
 *   curved   — 'false' to use straight edges
 *   keyboard — 'false' to disable global keyboard shortcuts
 */

import { GMermaid } from '../index.js';

/**
 * `<g-diagram>` custom element wrapping a GMermaid instance in a shadow root.
 * Reads its source from inline text content or a `src` attribute and reflects
 * attribute changes (theme/height/curved/src) onto the live diagram.
 */
class GDiagramElement extends HTMLElement {
  /** @type {object|null} The underlying GMermaid instance, or null when unmounted. */
  #diagram  = null;
  /** @type {ShadowRoot|null} This element's open shadow root. */
  #shadow   = null;
  /** @type {HTMLElement|null} The `#root` div inside the shadow that hosts the diagram. */
  #container = null;

  /**
   * Attributes whose changes trigger attributeChangedCallback.
   * @returns {string[]} The observed attribute names.
   */
  static get observedAttributes() {
    return ['src', 'theme', 'height', 'curved', 'keyboard'];
  }

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
  }

  /** Lifecycle: build the shadow DOM and mount the diagram when connected. */
  connectedCallback() {
    this.#build();
    this.#mount();
  }

  /** Lifecycle: destroy the diagram and release it when disconnected. */
  disconnectedCallback() {
    this.#diagram?.destroy();
    this.#diagram = null;
  }

  /**
   * Lifecycle: reflect an observed attribute change onto the live diagram.
   * @param {string} name - The attribute that changed.
   * @param {string|null} oldVal - Previous value.
   * @param {string|null} newVal - New value.
   * @returns {void}
   */
  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this.#diagram) return;
    switch (name) {
      case 'src':      this.#loadSrc(newVal); break;
      case 'theme':    this.#diagram.setTheme(newVal ?? 'dark'); break;
      case 'height':   this.style.height = newVal ?? '400px'; break;
      case 'curved':   this.#diagram.setCurved(newVal !== 'false'); break;
    }
  }

  /**
   * Programmatically load Mermaid source into the diagram.
   * @param {string} source - Mermaid diagram source text.
   * @returns {Promise<*>|undefined} The diagram's load result, or undefined if unmounted.
   */
  async load(source) {
    return this.#diagram?.load(source);
  }

  /**
   * Export the current diagram as an SVG string.
   * @param {object} [opts] - Export options forwarded to GMermaid.
   * @returns {string|undefined} The SVG markup, or undefined if unmounted.
   */
  exportSVG(opts) { return this.#diagram?.exportSVG(opts); }

  /**
   * Export the current diagram as a PNG data-URL.
   * @param {object} [opts] - Export options forwarded to GMermaid.
   * @returns {Promise<string>|string|undefined} The PNG data-URL, or undefined if unmounted.
   */
  exportPNG(opts) { return this.#diagram?.exportPNG(opts); }

  /**
   * Build the shadow DOM: set host height, inject minimal layout styles, and
   * create the `#root` container that hosts the diagram.
   * @returns {void}
   */
  #build() {
    const height = this.getAttribute('height') ?? '400px';
    this.style.display = 'block';
    this.style.height  = height;

    // Minimal styles injected into shadow root — just enough for layout
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; }
      #root { width: 100%; height: 100%; }
    `;
    this.#container = document.createElement('div');
    this.#container.id = 'root';
    this.#shadow.appendChild(style);
    this.#shadow.appendChild(this.#container);
  }

  /**
   * Create the GMermaid instance from attributes, then load source from `src`
   * (if present) or the element's inline text content.
   * @returns {void}
   */
  #mount() {
    const theme    = this.getAttribute('theme')    ?? 'dark';
    const curved   = this.getAttribute('curved')   !== 'false';
    const keyboard = this.getAttribute('keyboard') !== 'false';

    this.#diagram = GMermaid.create(this.#container, {
      theme,
      curved,
      keyboard,
    });

    const src = this.getAttribute('src');
    if (src) {
      this.#loadSrc(src);
    } else {
      const inline = this.textContent.trim();
      if (inline) this.#diagram.load(inline);
    }
  }

  /**
   * Fetch Mermaid source from a URL and load it into the diagram.
   * Logs to the console on failure rather than throwing.
   * @param {string} url - URL of a `.mmd` (or text) source file.
   * @returns {Promise<void>}
   */
  async #loadSrc(url) {
    if (!url || !this.#diagram) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await this.#diagram.load(await res.text());
    } catch (err) {
      console.error('[g-diagram] Failed to load src:', url, err);
    }
  }
}

if (!customElements.get('g-diagram')) {
  customElements.define('g-diagram', GDiagramElement);
}

export { GDiagramElement };
