/**
 * gMermaid — JiveDoc plugin adapter
 *
 * Registers a 'diagram' block type in JiveDoc so editors can embed
 * interactive Mermaid diagrams. Handles render lifecycle, state
 * serialization, and theme inheritance.
 *
 * Usage (in JiveDoc app init):
 *   import { registerGMermaidPlugin } from 'gmermaid/src/plugins/jivedoc.js';
 *   registerGMermaidPlugin(JiveDoc, { theme: 'dark' });
 */

import { GMermaid } from '../index.js';

/**
 * @param {object} JiveDoc  — the JiveDoc instance (must expose registerBlockType)
 * @param {object} [opts]
 * @param {'dark'|'light'|'github'|object} [opts.theme='dark']
 * @param {boolean} [opts.keyboard=false]  — disable global keydown listener inside Milkdown
 * @param {number}  [opts.snapGrid=0]
 */
export function registerGMermaidPlugin(JiveDoc, opts = {}) {
  const {
    theme    = 'dark',
    keyboard = false,
    snapGrid = 0,
  } = opts;

  JiveDoc.registerBlockType({
    type:  'diagram',
    label: 'Diagram',
    icon:  '◇',

    /**
     * Render a diagram block.
     * @param {{ container: HTMLElement, data: { source?: string, layout?: object } }} ctx
     * @returns {() => void}  cleanup function
     */
    render({ container, data }) {
      data.source ??= 'flowchart LR\n  A --> B';
      data.layout ??= {};

      const d = GMermaid.create(container, {
        source:   data.source,
        layout:   data.layout,
        theme,
        keyboard,
        snapGrid,
      });

      d.on('sourceChange', src     => { data.source = src; });
      d.on('nodeMove',     ({ id, x, y }) => { data.layout[id] = { x, y }; });

      return () => d.destroy();
    },

    /**
     * Convert block data to a storable string.
     * @param {{ source: string, layout: object }} data
     * @returns {string}
     */
    serialize({ source, layout }) {
      return JSON.stringify({ source, layout: layout ?? {} });
    },

    /**
     * Restore block data from stored string.
     * @param {string} str
     * @returns {{ source: string, layout: object }}
     */
    deserialize(str) {
      try {
        return JSON.parse(str);
      } catch {
        return { source: str, layout: {} };
      }
    },

    /**
     * Return a default empty block.
     * @returns {{ source: string, layout: object }}
     */
    defaultData() {
      return { source: 'flowchart LR\n  A[Start] --> B[End]', layout: {} };
    },
  });
}
