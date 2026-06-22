/**
 * index.js — public entry point and orchestrator for gMermaid.
 *
 * Wires together the full render pipeline:
 *   text → detectType → parse → AST → layout → render → interactive SVG
 *
 * Exposes `detectType` (sniff the diagram kind from the first line), `parse`
 * (text → diagram-specific AST), and the `GMermaid` factory. The internal
 * `Diagram` class owns one rendered instance: it holds the core services
 * (EventBus, Theme, Renderer, Interact, History, VirtualRenderer), runs auto
 * layout, dispatches to the per-type renderers, manages undo/redo, keyboard
 * shortcuts, accessibility, resize re-fitting, and SVG/PNG export.
 */
import { EventBus }          from './core/events.js';
import { Theme }             from './core/theme.js';
import { Interact }          from './core/interact.js';
import { Renderer }          from './core/renderer.js';
import { History }           from './core/history.js';
import { layoutFlowchart, layoutFlowchartClustered, layoutGrid } from './core/layout.js';
import { VirtualRenderer }   from './core/virtual.js';
import { parseFlowchart }    from './diagrams/flowchart/parser.js';
import { renderFlowchart }   from './diagrams/flowchart/renderer.js';
import { parseERD }          from './diagrams/erd/parser.js';
import { renderERD }         from './diagrams/erd/renderer.js';
import { parseSequence }     from './diagrams/sequence/parser.js';
import { renderSequence }    from './diagrams/sequence/renderer.js';
import { parseClass }        from './diagrams/class/parser.js';
import { renderClass }       from './diagrams/class/renderer.js';
import { parseState }        from './diagrams/state/parser.js';
import { renderState }       from './diagrams/state/renderer.js';
import { parsePie }          from './diagrams/pie/parser.js';
import { renderPie }         from './diagrams/pie/renderer.js';
import { parseGantt }        from './diagrams/gantt/parser.js';
import { renderGantt }       from './diagrams/gantt/renderer.js';
import { parseGit }          from './diagrams/git/parser.js';
import { renderGit }         from './diagrams/git/renderer.js';
import { parseMindmap }      from './diagrams/mindmap/parser.js';
import { renderMindmap }     from './diagrams/mindmap/renderer.js';
import { parseTimeline }     from './diagrams/timeline/parser.js';
import { renderTimeline }    from './diagrams/timeline/renderer.js';
import { parseJourney }      from './diagrams/journey/parser.js';
import { renderJourney }     from './diagrams/journey/renderer.js';
import { parseC4 }           from './diagrams/c4/parser.js';
import { renderC4 }          from './diagrams/c4/renderer.js';
import { parseBlock }        from './diagrams/block/parser.js';
import { renderBlock }       from './diagrams/block/renderer.js';
import { parseQuadrant }     from './diagrams/quadrant/parser.js';
import { renderQuadrant }    from './diagrams/quadrant/renderer.js';
import { parseRequirement }  from './diagrams/requirement/parser.js';
import { renderRequirement } from './diagrams/requirement/renderer.js';
import { parseSankey }       from './diagrams/sankey/parser.js';
import { renderSankey }      from './diagrams/sankey/renderer.js';
import { parseXYChart }      from './diagrams/xychart/parser.js';
import { renderXYChart }     from './diagrams/xychart/renderer.js';
import { parseArchitecture } from './diagrams/architecture/parser.js';
import { renderArchitecture } from './diagrams/architecture/renderer.js';
import { parseKanban }       from './diagrams/kanban/parser.js';
import { renderKanban }      from './diagrams/kanban/renderer.js';
import { parsePacket }       from './diagrams/packet/parser.js';
import { renderPacket }      from './diagrams/packet/renderer.js';

/** Inline SVG padlock glyphs for the lock-toggle button (closed = locked). */
const LOCK_ICON_CLOSED = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="11" width="15" height="9.5" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const LOCK_ICON_OPEN   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="11" width="15" height="9.5" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>';

/**
 * Detect a diagram's type by matching a keyword on its first non-empty line.
 * @param {string} text - Raw Mermaid-style source text.
 * @returns {string} The diagram type id (e.g. 'flowchart'), or 'unknown'.
 */
export function detectType(text) {
  const first = text.trim().split('\n')[0].trim().toLowerCase();
  if (/^(flowchart|graph)\b/.test(first))   return 'flowchart';
  if (/^erdiagram\b/i.test(first))          return 'erd';
  if (/^sequencediagram\b/i.test(first))    return 'sequence';
  if (/^classdiagram\b/i.test(first))       return 'class';
  if (/^statediagram(-v2)?\b/i.test(first)) return 'state';
  if (/^pie\b/i.test(first))               return 'pie';
  if (/^gantt\b/i.test(first))             return 'gantt';
  if (/^gitgraph\b/i.test(first))          return 'git';
  if (/^mindmap\b/i.test(first))           return 'mindmap';
  if (/^timeline\b/i.test(first))          return 'timeline';
  if (/^journey\b/i.test(first))           return 'journey';
  if (/^c4/i.test(first))                  return 'c4';
  if (/^block-beta\b/i.test(first))        return 'block';
  if (/^quadrantchart\b/i.test(first))     return 'quadrant';
  if (/^requirementdiagram\b/i.test(first)) return 'requirement';
  if (/^sankey-beta\b/i.test(first))       return 'sankey';
  if (/^xychart-beta\b/i.test(first))      return 'xychart';
  if (/^architecture-beta\b/i.test(first)) return 'architecture';
  if (/^kanban\b/i.test(first))            return 'kanban';
  if (/^packet(-beta)?\b/i.test(first))    return 'packet';
  return 'unknown';
}

/**
 * Parse source text into a diagram-specific AST by dispatching on its type.
 * @param {string} text - Raw Mermaid-style source text.
 * @returns {object} The parsed AST (shape depends on the detected type).
 * @throws {Error} If the diagram type is unsupported/unknown.
 */
export function parse(text) {
  const type = detectType(text);
  switch (type) {
    case 'flowchart': return parseFlowchart(text);
    case 'erd':       return parseERD(text);
    case 'sequence':  return parseSequence(text);
    case 'class':     return parseClass(text);
    case 'state':     return parseState(text);
    case 'pie':       return parsePie(text);
    case 'gantt':     return parseGantt(text);
    case 'git':       return parseGit(text);
    case 'mindmap':   return parseMindmap(text);
    case 'timeline':  return parseTimeline(text);
    case 'journey':   return parseJourney(text);
    case 'c4':          return parseC4(text);
    case 'block':       return parseBlock(text);
    case 'quadrant':    return parseQuadrant(text);
    case 'requirement': return parseRequirement(text);
    case 'sankey':      return parseSankey(text);
    case 'xychart':     return parseXYChart(text);
    case 'architecture': return parseArchitecture(text);
    case 'kanban':      return parseKanban(text);
    case 'packet':      return parsePacket(text);
    default: throw new Error(`gMermaid: unsupported diagram type — first line: "${text.split('\n')[0]}"`);
  }
}

/**
 * Map an AST to its array of positionable/draggable nodes. The property name
 * varies per diagram type (nodes, entities, classes, …); this normalises them
 * for layout, fitToContent and interaction wiring.
 * @param {object} ast - A parsed diagram AST.
 * @returns {Array<object>} The node objects, or an empty array when none apply.
 */
function getNodes(ast) {
  switch (ast?.type) {
    case 'flowchart':    return ast.nodes ?? [];
    case 'erd':          return ast.entities ?? [];
    case 'class':        return ast.classes ?? [];
    case 'state':        return ast.states ?? [];
    case 'block':        return ast.blocks ?? [];
    case 'requirement':  return [...(ast.requirements ?? []), ...(ast.elements ?? [])];
    case 'architecture': return ast.services ?? [];
    case 'sequence':     return []; // no draggable nodes
    default:             return [];
  }
}

/**
 * Diagram — a single rendered, interactive diagram instance.
 *
 * Owns the core services and drives the per-instance pipeline: parse source →
 * apply/auto layout → render the correct diagram type → wire interaction,
 * history, accessibility and keyboard shortcuts. Created via GMermaid.create().
 */
class Diagram {
  #container;            // host element passed by the caller
  #options;              // merged construction options
  #bus;                  // EventBus shared across services
  #theme;                // Theme (CSS custom properties)
  #renderer;             // Renderer (SVG scaffold + layers)
  #interact;             // Interact (pan/zoom/drag/label-edit)
  #history;              // History (undo/redo command stack)
  #resizeObserver;       // refits content when the container resizes
  #ast        = null;    // currently loaded AST (null until load())
  #layout     = {};      // active layout (options.layout + user drags)
  #curved     = true;    // whether edges render as curves vs straight lines
  #firstRender = true;   // gates the one-time auto fit-to-content
  #keyHandler;           // bound window keydown listener for shortcuts
  #virtualRenderer = null; // active VirtualRenderer for large diagrams, else null
  #locked     = false;   // when true, the viewer ignores all user interaction
  #lockBtn    = null;    // optional on-diagram lock/unlock toggle button

  static #VIRTUAL_THRESHOLD = 100; // nodes above this trigger virtual rendering

  /**
   * @param {HTMLElement} container - Element to render the diagram into.
   * @param {object} [options={}] - Options: source, theme, layout, curved,
   *   snapGrid, keyboard, ariaLabel.
   */
  constructor(container, options = {}) {
    this.#container = container;
    this.#options   = { ...options };
    this.#bus       = new EventBus();
    this.#renderer  = new Renderer(container);
    this.#theme     = new Theme(container);
    this.#interact  = new Interact(this.#renderer.stage, this.#renderer.viewport, this.#bus);
    this.#history   = new History(this.#bus);

    if (options.theme)   this.#theme.apply(options.theme);
    if (options.layout)  this.#layout = { ...options.layout };
    if (options.curved !== undefined) this.#curved = options.curved;
    if (options.snapGrid) this.#interact.snapGrid = options.snapGrid;
    if (options.locked) this.setLocked(true);
    if (options.lockButton) this.#createLockButton();

    // Node moved → track in history, also update #layout so re-renders preserve position
    this.#bus.on('nodeMove', ({ id, x, y, from, nodeState }) => {
      if (!from || !nodeState) return;
      this.#layout[id] = { x, y };
      const prevLayout = { ...from };
      this.#history.push({
        do:   () => { nodeState.x = x;         nodeState.y = y;         this.#layout[id] = { x, y }; },
        undo: () => { nodeState.x = from.x;    nodeState.y = from.y;    this.#layout[id] = prevLayout; },
      });
    });

    // Label edited → track in history
    this.#bus.on('labelEdit', ({ id, label, oldLabel, nodeState }) => {
      if (!nodeState) return;
      this.#history.push({
        do:   () => { nodeState.label = label;    nodeState.name = label;    },
        undo: () => { nodeState.label = oldLabel; nodeState.name = oldLabel; },
      });
    });

    // Accessibility: make the SVG stage keyboard-focusable
    const stage = this.#renderer.stage;
    stage.setAttribute('tabindex', '0');
    stage.setAttribute('role', 'img');
    stage.setAttribute('aria-label', options.ariaLabel ?? 'Diagram');

    // Global keyboard shortcuts — only when no text input is focused; skip when keyboard:false
    this.#keyHandler = e => {
      if (this.#locked) return; // no keyboard pan/zoom/undo when locked
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;
      const mod  = e.ctrlKey || e.metaKey;
      const onStage = document.activeElement === stage || container.contains(document.activeElement);

      if (mod && !e.shiftKey && e.key === 'z') { e.preventDefault(); this.undo(); }
      if (mod && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); this.redo(); }

      // Stage-focused arrow-key panning and zoom shortcuts
      if (onStage) {
        const PAN = 40;
        switch (e.key) {
          case 'ArrowLeft':  e.preventDefault(); this.#interact.panBy( PAN, 0); break;
          case 'ArrowRight': e.preventDefault(); this.#interact.panBy(-PAN, 0); break;
          case 'ArrowUp':    e.preventDefault(); this.#interact.panBy(0,  PAN); break;
          case 'ArrowDown':  e.preventDefault(); this.#interact.panBy(0, -PAN); break;
          case '=': case '+': e.preventDefault(); this.zoomIn();       break;
          case '-': case '_': e.preventDefault(); this.zoomOut();      break;
          case 'f': case 'F': e.preventDefault(); this.fitToContent(); break;
        }
      }
    };
    if (options.keyboard !== false) window.addEventListener('keydown', this.#keyHandler);

    // Auto-refit when container is resized (after first render)
    this.#resizeObserver = new ResizeObserver(() => {
      if (this.#ast && !this.#firstRender) this.fitToContent();
    });
    this.#resizeObserver.observe(container);

    if (options.source) {
      this.load(options.source).catch(err => console.error('[gMermaid]', err));
    }
  }

  /**
   * Parse and render new source text, resetting layout/history and re-fitting.
   * @param {string} mermaidText - The diagram source to load.
   * @returns {Promise<object>} Resolves with the parsed AST.
   */
  async load(mermaidText) {
    this.#options.source = mermaidText;
    this.#ast = parse(mermaidText);
    this.#layout = { ...this.#options.layout };  // reset to externally-saved layout
    this.#history.clear();
    this.#firstRender = true;
    this.#applyLayout();
    this.#render();
    this.#bus.emit('sourceChange', mermaidText);
    return this.#ast;
  }

  /**
   * Position nodes: restore any saved coordinates from #layout, then auto-lay
   * out the remaining nodes using the layout strategy for the AST's type.
   * @returns {void}
   */
  #applyLayout() {
    if (!this.#ast) return;
    const nodes = getNodes(this.#ast);

    for (const n of nodes) {
      if (this.#layout[n.id]) { n.x = this.#layout[n.id].x; n.y = this.#layout[n.id].y; }
    }

    const autoNodes = nodes.filter(n => !this.#layout[n.id]);
    if (autoNodes.length) {
      switch (this.#ast.type) {
        case 'flowchart':
          // Subgraphs need cluster-aware layout over ALL nodes; otherwise the
          // plain layered layout suffices for the auto-positioned nodes.
          if (this.#ast.subgraphs?.length) layoutFlowchartClustered(this.#ast.nodes, this.#ast.edges ?? [], this.#ast.subgraphs, this.#ast.direction);
          else layoutFlowchart(autoNodes, this.#ast.edges ?? [], this.#ast.direction);
          break;
        case 'class':     /* class layout (incl. namespaces) is handled in renderClass */ break;
        case 'state':     /* handled inside renderState */ break;
        default:          layoutGrid(autoNodes); break;
      }
    }
  }

  /**
   * Render the active AST: dispatch to its type-specific renderer, wire inline
   * editing/accessibility/keyboard on each node, apply the view, (re)activate
   * virtual rendering for large diagrams, and run the one-time auto-fit.
   * @param {boolean} [fit=true] - When false, skip auto fit-to-content (used by
   *   undo/redo so the current camera position is preserved).
   * @returns {void}
   */
  #render(fit = true) {
    if (!this.#ast) return;
    const { nodeLayer, edgeLayer } = this.#renderer;

    switch (this.#ast.type) {
      case 'flowchart': renderFlowchart(this.#ast, nodeLayer, edgeLayer, this.#interact, this.#curved); break;
      case 'erd':       renderERD(this.#ast, nodeLayer, edgeLayer, this.#interact, this.#curved); break;
      case 'sequence':  renderSequence(this.#ast, nodeLayer, edgeLayer, this.#interact, this.#curved); break;
      case 'class':     renderClass(this.#ast, nodeLayer, edgeLayer, this.#interact, this.#curved); break;
      case 'state':     renderState(this.#ast, nodeLayer, edgeLayer, this.#interact, this.#curved); break;
      case 'pie':       renderPie(this.#ast, nodeLayer, edgeLayer); break;
      case 'gantt':     renderGantt(this.#ast, nodeLayer, edgeLayer); break;
      case 'git':       renderGit(this.#ast, nodeLayer, edgeLayer); break;
      case 'mindmap':   renderMindmap(this.#ast, nodeLayer, edgeLayer, this.#interact); break;
      case 'timeline':  renderTimeline(this.#ast, nodeLayer, edgeLayer); break;
      case 'journey':   renderJourney(this.#ast, nodeLayer, edgeLayer); break;
      case 'c4':          renderC4(this.#ast, nodeLayer, edgeLayer); break;
      case 'block':       renderBlock(this.#ast, nodeLayer, edgeLayer, this.#interact); break;
      case 'quadrant':    renderQuadrant(this.#ast, nodeLayer, edgeLayer); break;
      case 'requirement': renderRequirement(this.#ast, nodeLayer, edgeLayer, this.#interact); break;
      case 'sankey':      renderSankey(this.#ast, nodeLayer, edgeLayer); break;
      case 'xychart':     renderXYChart(this.#ast, nodeLayer, edgeLayer); break;
      case 'architecture': renderArchitecture(this.#ast, nodeLayer, edgeLayer, this.#interact); break;
      case 'kanban':      renderKanban(this.#ast, nodeLayer, edgeLayer); break;
      case 'packet':      renderPacket(this.#ast, nodeLayer, edgeLayer); break;
    }

    // Attach inline label editing and accessibility attrs to every draggable node
    for (const node of getNodes(this.#ast)) {
      const el = nodeLayer.querySelector(`[data-id="${node.id}"]`);
      if (!el) continue;
      this.#interact.attachLabelEdit(el, node);
      // Accessibility
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'graphics-symbol');
      el.setAttribute('aria-label', node.label ?? node.name ?? node.id);
      // Enter key triggers label edit
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); el.dispatchEvent(new PointerEvent('dblclick', { bubbles: true })); }
      });
    }

    this.#interact.applyView();

    // Virtual rendering — replace any prior instance, then activate only when
    // the node count exceeds the threshold (off-screen culling for perf).
    this.#virtualRenderer?.destroy();
    this.#virtualRenderer = null;
    const nodes = getNodes(this.#ast);
    if (nodes.length > Diagram.#VIRTUAL_THRESHOLD) {
      this.#virtualRenderer = new VirtualRenderer(nodeLayer, nodes, this.#bus);
    }

    if (fit && this.#firstRender) {
      this.#firstRender = false;
      if (nodes.length) setTimeout(() => this.fitToContent(), 60);
      else setTimeout(() => this.#fitContent(), 60);
    }
  }

  /**
   * Fit the view for node-less diagrams (sequence, pie, gantt, …) by measuring
   * the union bounding box of the rendered content layers. The viewport's own
   * bbox can't be used because it includes the large grid-background rect.
   * @returns {void}
   */
  #fitContent() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const layer of [this.#renderer.nodeLayer, this.#renderer.edgeLayer]) {
      if (!layer?.childNodes.length) continue;
      let b;
      try { b = layer.getBBox(); } catch { continue; }
      if (!b || (!b.width && !b.height)) continue;
      minX = Math.min(minX, b.x);          minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
    }
    if (!Number.isFinite(minX)) return;
    this.#interact.fitToContent([{ x: minX, y: minY, w: maxX - minX, h: maxY - minY }]);
  }

  // ── Public API ────────────────────────────────────────────────────

  /** Undo the last change and re-render without re-fitting. @returns {void} */
  undo() { if (this.#history.undo()) this.#render(false); }
  /** Redo the last undone change and re-render without re-fitting. @returns {void} */
  redo() { if (this.#history.redo()) this.#render(false); }

  /** @returns {string} The currently loaded source text. */
  getSource() { return this.#options.source ?? ''; }

  /**
   * Snapshot current node positions keyed by node id.
   * @returns {Record<string, {x: number, y: number}>} Position map.
   */
  getLayout() {
    const nodes = getNodes(this.#ast ?? {});
    return Object.fromEntries(nodes.map(n => [n.id, { x: n.x, y: n.y }]));
  }

  /**
   * Return serializable state: source plus current node positions.
   * @returns {{source: string, layout: Record<string, {x: number, y: number}>}}
   */
  getState() {
    return {
      source: this.getSource(),
      layout: this.getLayout(),
    };
  }

  /**
   * Restore a previously saved state (source + layout).
   * @param {{source?: string, layout?: object}} state - State from getState().
   * @returns {Promise<object>} Resolves with the parsed AST.
   */
  async loadState(state) {
    if (state?.layout) this.#options.layout = { ...state.layout };
    return this.load(state?.source ?? '');
  }

  /**
   * Apply a theme preset name or custom token map.
   * @param {string | Record<string, string>} nameOrTokens - Preset name or tokens.
   * @returns {void}
   */
  setTheme(nameOrTokens) { this.#theme.apply(nameOrTokens); }
  /**
   * Toggle curved vs straight edges, re-rendering if a diagram is loaded.
   * @param {boolean} curved - True for curved edges.
   * @returns {void}
   */
  setCurved(curved)      { this.#curved = curved; if (this.#ast) this.#render(false); }
  /**
   * Set the drag snap-to-grid pitch (0 disables snapping).
   * @param {number} grid - Grid pitch in world units.
   * @returns {void}
   */
  setSnapGrid(grid)      { this.#interact.snapGrid = grid; }

  /**
   * Lock or unlock the viewer. When locked, all user interaction (pan, zoom,
   * node drag, inline label edit, keyboard shortcuts) is disabled and wheel
   * events pass through to the page, so the diagram never interferes with the
   * host app. Programmatic API (load, setTheme, fitToContent, …) still works.
   * @param {boolean} locked - True to lock, false to unlock.
   * @returns {void}
   */
  setLocked(locked) {
    this.#locked = !!locked;
    this.#interact.locked = this.#locked;
    this.#container.classList.toggle('gm-locked', this.#locked);
    // Reset the grab/move cursor while locked; restore the themed cursor otherwise.
    this.#renderer.stage.style.cursor = this.#locked ? 'default' : '';
    this.#updateLockButton();
    this.#bus.emit('lockChange', this.#locked);
  }

  /** Lock the viewer (shorthand for `setLocked(true)`). @returns {void} */
  lock()   { this.setLocked(true); }
  /** Unlock the viewer (shorthand for `setLocked(false)`). @returns {void} */
  unlock() { this.setLocked(false); }
  /** @returns {boolean} Whether the viewer is currently locked. */
  isLocked() { return this.#locked; }

  /**
   * Show or hide the on-diagram lock/unlock toggle button (a corner overlay the
   * end-user can click). Idempotent.
   * @param {boolean} show - True to show the button, false to remove it.
   * @returns {void}
   */
  showLockButton(show = true) {
    if (show && !this.#lockBtn) this.#createLockButton();
    else if (!show && this.#lockBtn) { this.#lockBtn.remove(); this.#lockBtn = null; }
  }

  /**
   * Create the overlay lock/unlock toggle button and wire its click to toggle
   * the lock. The button stays clickable even while the viewer is locked.
   * @returns {void}
   */
  #createLockButton() {
    if (this.#lockBtn) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gm-lock-toggle';
    btn.addEventListener('pointerdown', e => e.stopPropagation()); // don't start a pan
    btn.addEventListener('click', e => { e.stopPropagation(); this.setLocked(!this.#locked); });
    this.#container.appendChild(btn);
    this.#lockBtn = btn;
    this.#updateLockButton();
  }

  /**
   * Sync the lock button's icon, tooltip and state class with the current lock.
   * @returns {void}
   */
  #updateLockButton() {
    const btn = this.#lockBtn;
    if (!btn) return;
    btn.innerHTML = this.#locked ? LOCK_ICON_CLOSED : LOCK_ICON_OPEN;
    btn.classList.toggle('is-locked', this.#locked);
    const label = this.#locked ? 'Unlock diagram (enable pan/zoom)' : 'Lock diagram (disable pan/zoom)';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.setAttribute('aria-pressed', String(this.#locked));
  }

  /**
   * Zoom and centre the view so the whole diagram is visible.
   * @returns {void}
   */
  fitToContent() {
    const nodes = getNodes(this.#ast ?? {});
    if (nodes.length) this.#interact.fitToContent(nodes);
    else this.#fitContent();
  }

  /** Zoom in, centred on the stage. @returns {void} */
  zoomIn()  { this.#interact.zoomIn(); }
  /** Zoom out, centred on the stage. @returns {void} */
  zoomOut() { this.#interact.zoomOut(); }

  /**
   * Export the current diagram as an SVG string.
   * @param {{inline?: boolean}} [opts] - inline (default true) embeds the theme
   *   <style> so the SVG is self-contained.
   * @returns {string} Serialized SVG markup.
   */
  exportSVG({ inline = true } = {}) {
    const clone = this.#renderer.stage.cloneNode(true);
    if (inline) {
      const css     = this.#container.querySelector('style')?.textContent ?? '';
      const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      styleEl.textContent = css;
      clone.insertBefore(styleEl, clone.firstChild);
    }
    return new XMLSerializer().serializeToString(clone);
  }

  /**
   * Export the current diagram as a PNG data URL. Because an off-DOM SVG drawn
   * to a canvas can't resolve `--gm-*` custom properties, this inlines the
   * theme CSS with every `var(--gm-...)` replaced by its computed value (or the
   * declared fallback, else '#888') before rasterising at the given scale.
   * @param {{scale?: number}} [opts] - scale (default 2) is the pixel density multiplier.
   * @returns {Promise<string>} Resolves with a 'data:image/png' URL.
   */
  async exportPNG({ scale = 2 } = {}) {
    const stage = this.#renderer.stage;
    const w     = stage.clientWidth  || 800;
    const h     = stage.clientHeight || 600;

    const clone = stage.cloneNode(true);
    clone.setAttribute('width',  w);
    clone.setAttribute('height', h);
    clone.setAttribute('xmlns',  'http://www.w3.org/2000/svg');

    // Resolve every var(--gm-name, fallback) against the container's computed
    // styles so the cloned, off-DOM SVG paints with concrete colours/values.
    const rawCss = this.#container.querySelector('style')?.textContent ?? '';
    const cs     = getComputedStyle(this.#container);
    const resolved = rawCss.replace(
      /var\(--gm-([^,)]+)(?:,\s*([^)]+))?\)/g,
      (_, name, fallback) => {
        const val = cs.getPropertyValue(`--gm-${name.trim()}`).trim();
        return val || fallback?.trim() || '#888';
      }
    );

    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = resolved;
    clone.insertBefore(styleEl, clone.firstChild);

    const svgText = new XMLSerializer().serializeToString(clone);
    const blob    = new Blob([svgText], { type: 'image/svg+xml' });
    const url     = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas  = document.createElement('canvas');
        canvas.width  = w * scale;
        canvas.height = h * scale;
        const ctx     = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('PNG export failed')); };
      img.src = url;
    });
  }

  /**
   * Subscribe to an instance event (e.g. 'nodeMove', 'sourceChange', 'historyChange').
   * @param {string} event - Event name.
   * @param {(data: any) => void} handler - Callback.
   * @returns {() => void} Unsubscribe function.
   */
  on(event, handler) { return this.#bus.on(event, handler); }

  /**
   * Tear down the instance: remove listeners/observers and destroy all services.
   * @returns {void}
   */
  destroy() {
    if (this.#options.keyboard !== false) window.removeEventListener('keydown', this.#keyHandler);
    this.#lockBtn?.remove();
    this.#resizeObserver.disconnect();
    this.#virtualRenderer?.destroy();
    this.#theme.destroy();
    this.#renderer.destroy();
    this.#bus.destroy();
    this.#history.clear();
  }
}

/**
 * GMermaid — the public API surface (also the default export).
 * @namespace
 */
export const GMermaid = {
  version: '0.6.0',

  /**
   * Create and render a new diagram instance.
   * @param {HTMLElement} container - Element to render into.
   * @param {object} [options={}] - See the Diagram constructor for options.
   * @returns {Diagram} The created diagram instance.
   */
  create(container, options = {}) {
    return new Diagram(container, options);
  },

  parse,
  detectType,
};

export default GMermaid;
