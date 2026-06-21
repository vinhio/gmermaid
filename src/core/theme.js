/**
 * theme.js — visual theming for the diagram stage.
 *
 * Defines built-in colour/typography presets and a Theme class that injects
 * them as CSS custom properties (`--gm-*`) onto the diagram container. Every
 * diagram renderer reads these variables via `var(--gm-...)`, so swapping a
 * theme is purely a matter of rewriting the variable block — no re-render of
 * the SVG is required. (exportPNG later resolves these vars to concrete
 * values so an off-DOM canvas can paint them.)
 */

/**
 * Built-in theme presets keyed by name. Each value is a flat map of
 * `--gm-*` CSS custom-property names to their string values.
 * @type {Record<string, Record<string, string>>}
 */
const PRESETS = {
  dark: {
    '--gm-bg':            '#0d1117',
    '--gm-grid':          '#1c2128',
    '--gm-panel':         '#161b22',
    '--gm-panel-border':  '#30363d',
    '--gm-header':        '#1b2029',
    '--gm-text':          '#e6edf3',
    '--gm-muted':         '#8b949e',
    '--gm-accent':        '#3fb950',
    '--gm-accent-dim':    '#238636',
    '--gm-selected':      '#c6f24e',
    '--gm-edge':          '#3c4655',
    '--gm-edge-hi':       '#3fb950',
    '--gm-node-fill':     '#161b22',
    '--gm-node-stroke':   '#30363d',
    '--gm-node-stroke-w': '1.5px',
    '--gm-node-radius':   '8px',
    '--gm-node-text':     '#e6edf3',
    '--gm-pk':            '#f2c14e',
    '--gm-fk':            '#5cc8ff',
    '--gm-font':          "'JetBrains Mono', monospace",
    '--gm-font-size':     '12px',
    '--gm-label-font':    "'Sora', sans-serif",
  },
  light: {
    '--gm-bg':            '#ffffff',
    '--gm-grid':          '#f0f0f0',
    '--gm-panel':         '#f8f9fa',
    '--gm-panel-border':  '#d0d7de',
    '--gm-header':        '#f0f3f5',
    '--gm-text':          '#1f2328',
    '--gm-muted':         '#656d76',
    '--gm-accent':        '#1a7f37',
    '--gm-accent-dim':    '#2da44e',
    '--gm-selected':      '#0969da',
    '--gm-edge':          '#8c959f',
    '--gm-edge-hi':       '#1a7f37',
    '--gm-node-fill':     '#ffffff',
    '--gm-node-stroke':   '#d0d7de',
    '--gm-node-stroke-w': '1.5px',
    '--gm-node-radius':   '8px',
    '--gm-node-text':     '#1f2328',
    '--gm-pk':            '#9a6700',
    '--gm-fk':            '#0969da',
    '--gm-font':          "'JetBrains Mono', monospace",
    '--gm-font-size':     '12px',
    '--gm-label-font':    "'Sora', sans-serif",
  },
  github: {
    '--gm-bg':            '#ffffff',
    '--gm-grid':          '#eaeef2',
    '--gm-panel':         '#f6f8fa',
    '--gm-panel-border':  '#d0d7de',
    '--gm-header':        '#eaeef2',
    '--gm-text':          '#1f2328',
    '--gm-muted':         '#636c76',
    '--gm-accent':        '#0969da',
    '--gm-accent-dim':    '#0550ae',
    '--gm-selected':      '#ddf4ff',
    '--gm-edge':          '#afb8c1',
    '--gm-edge-hi':       '#0969da',
    '--gm-node-fill':     '#f6f8fa',
    '--gm-node-stroke':   '#d0d7de',
    '--gm-node-stroke-w': '1px',
    '--gm-node-radius':   '6px',
    '--gm-node-text':     '#1f2328',
    '--gm-pk':            '#8250df',
    '--gm-fk':            '#0969da',
    '--gm-font':          "'SFMono-Regular', 'Consolas', monospace",
    '--gm-font-size':     '12px',
    '--gm-label-font':    "-apple-system, 'Segoe UI', system-ui, sans-serif",
  },
};

/**
 * Theme — manages the active set of `--gm-*` CSS custom properties for a
 * diagram container by writing them into a dedicated <style> element.
 */
export class Theme {
  #container;     // host element that carries the .gm-container class
  #styleEl;       // <style> element prepended to the container
  #tokens = {};   // currently active token map (name → value)

  /**
   * Create a theme bound to a container and apply the default 'dark' preset.
   * @param {HTMLElement} container - Element the diagram is rendered into.
   */
  constructor(container) {
    this.#container = container;
    this.#styleEl = document.createElement('style');
    container.prepend(this.#styleEl);
    this.apply('dark');
  }

  /**
   * Apply a preset by name or merge a custom token map over the current tokens.
   * @param {string | Record<string, string>} nameOrTokens - Preset name, or a
   *   map of `--gm-*` tokens to merge in. Unknown names fall back to 'dark'.
   * @returns {void}
   */
  apply(nameOrTokens) {
    const tokens = typeof nameOrTokens === 'string'
      ? (PRESETS[nameOrTokens] ?? PRESETS.dark)
      : nameOrTokens;
    // Merge so partial token maps only override the keys they specify
    this.#tokens = { ...this.#tokens, ...tokens };
    this.#flush();
  }

  /**
   * Serialise the active tokens into the container's <style> as a single
   * `.gm-container { ... }` rule.
   * @returns {void}
   */
  #flush() {
    const vars = Object.entries(this.#tokens)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join('\n');
    this.#styleEl.textContent = `.gm-container {\n${vars}\n}`;
  }

  /**
   * Read the current value of a single theme token.
   * @param {string} key - Token name, e.g. '--gm-accent'.
   * @returns {string | undefined} The token value, if set.
   */
  get(key) {
    return this.#tokens[key];
  }

  /**
   * Remove the injected <style> element from the DOM.
   * @returns {void}
   */
  destroy() {
    this.#styleEl.remove();
  }
}
