/**
 * layout.js — automatic node positioning for the pipeline's layout stage.
 *
 * Given parsed AST nodes (and, for flowcharts, edges), these helpers mutate
 * each node's x/y (and default w/h) in place so the renderer has coordinates
 * to draw at. `layoutFlowchart` performs a simple layered graph layout using
 * Kahn's topological algorithm; `layoutGrid` is the fallback for diagram types
 * without an inherent flow. Only nodes lacking a user-saved position are laid
 * out automatically (see Diagram#applyLayout).
 */

// Default node footprint and inter-node spacing, in world units.
const NODE_W = 140;
const NODE_H = 44;
const H_GAP  = 80;
const V_GAP  = 60;

/**
 * Layered ("Sugiyama-lite") layout: assign nodes to layers by longest-path
 * topological order, then place each layer in a row (TB/BT) or column (LR/RL).
 * Mutates each node's x/y/w/h in place.
 * @param {Array<{id: string, x?: number, y?: number, w?: number, h?: number}>} nodes - Nodes to position.
 * @param {Array<{from: string, to: string}>} edges - Directed edges between node ids.
 * @param {string} [direction='TB'] - Flow direction: 'TB', 'BT', 'LR' or 'RL'.
 * @returns {void}
 */
export function layoutFlowchart(nodes, edges, direction = 'TB') {
  if (!nodes.length) return;

  // Build id→node lookup, in-degree counts, and an adjacency list.
  const nodeMap  = new Map(nodes.map(n => [n.id, n]));
  const inDeg    = new Map(nodes.map(n => [n.id, 0]));
  const adj      = new Map(nodes.map(n => [n.id, []]));

  for (const e of edges) {
    if (inDeg.has(e.to)) inDeg.set(e.to, inDeg.get(e.to) + 1);
    if (adj.has(e.from)) adj.get(e.from).push(e.to);
  }

  // Kahn's algorithm → assign layers. Roots (in-degree 0) form layer 0; each
  // BFS wave decrements successors' in-degree and emits newly-freed nodes into
  // the next layer. `workDeg` is a mutable copy so `inDeg` stays intact.
  const layer    = new Map();
  const workDeg  = new Map(inDeg);
  let   queue    = nodes.filter(n => workDeg.get(n.id) === 0).map(n => n.id);

  // Cycle fallback: a fully-cyclic graph has no in-degree-0 node, so seed
  // the traversal with the first node to guarantee progress.
  if (!queue.length && nodes.length) queue = [nodes[0].id];

  let li = 0;
  while (queue.length) {
    const next = [];
    for (const id of queue) {
      if (layer.has(id)) continue;  // skip already-placed nodes
      layer.set(id, li);
      for (const nid of (adj.get(id) ?? [])) {
        workDeg.set(nid, workDeg.get(nid) - 1);
        if (workDeg.get(nid) === 0) next.push(nid);
      }
    }
    queue = next;
    li++;
  }

  // Any nodes left unassigned belong to a cycle Kahn couldn't drain; stack
  // them onto successive trailing layers so they still get coordinates.
  for (const n of nodes) {
    if (!layer.has(n.id)) layer.set(n.id, li++);
  }

  // Group node ids by their assigned layer index.
  const layers = [];
  for (const [id, l] of layer) {
    while (layers.length <= l) layers.push([]);
    layers[l].push(id);
  }

  // Horizontal flow places layers along x and members along y; vertical flow
  // (the default) does the opposite.
  const isLR = direction === 'LR' || direction === 'RL';

  layers.forEach((ids, layerIdx) => {
    ids.forEach((id, posIdx) => {
      const n = nodeMap.get(id);
      if (!n) return;
      if (isLR) {
        n.x = 40 + layerIdx * (NODE_W + H_GAP);
        n.y = 40 + posIdx  * (NODE_H + V_GAP);
      } else {
        n.x = 40 + posIdx  * (NODE_W + H_GAP);
        n.y = 40 + layerIdx * (NODE_H + V_GAP);
      }
      n.w = n.w ?? NODE_W;
      n.h = n.h ?? NODE_H;
    });
  });
}

/**
 * Fallback layout that arranges nodes in a fixed-pitch grid. Mutates each
 * node's x/y in place. Used for diagram types without an inherent flow.
 * @param {Array<{x?: number, y?: number}>} nodes - Nodes to position.
 * @param {number} [cols=4] - Number of columns before wrapping to a new row.
 * @returns {void}
 */
export function layoutGrid(nodes, cols = 4) {
  nodes.forEach((n, i) => {
    n.x = 40 + (i % cols) * 280;
    n.y = 40 + Math.floor(i / cols) * 260;
  });
}
