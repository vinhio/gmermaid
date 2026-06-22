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
  // (the default) does the opposite. Spacing accumulates by each node's actual
  // size so variable-width nodes never overlap.
  const isLR = direction === 'LR' || direction === 'RL';
  let mainOff = 40; // offset along the flow axis (advances per layer)

  layers.forEach(ids => {
    let crossOff = 40; // offset across the flow axis (advances per node in layer)
    let layerMain = 0; // largest node extent along the flow axis in this layer
    for (const id of ids) {
      const n = nodeMap.get(id);
      if (!n) continue;
      const w = n.w || NODE_W, h = n.h || NODE_H;
      if (isLR) {
        n.x = mainOff;  n.y = crossOff;
        crossOff += h + V_GAP; layerMain = Math.max(layerMain, w);
      } else {
        n.x = crossOff; n.y = mainOff;
        crossOff += w + H_GAP; layerMain = Math.max(layerMain, h);
      }
      n.w = w; n.h = h;
    }
    mainOff += layerMain + (isLR ? H_GAP : V_GAP);
  });
}

/**
 * Cluster-aware flowchart layout: each top-level subgraph is laid out
 * internally, then treated as a single super-node in an outer layered layout
 * (alongside free nodes), so members stay grouped and clusters don't overlap.
 * Sets node x/y and each subgraph's box geometry (x/y/w/h).
 * @param {Array<object>} nodes - All flowchart nodes (with w/h set).
 * @param {Array<{from: string, to: string}>} edges - All edges.
 * @param {Array<{id: string, nodes: string[], direction: string|null, x?: number, y?: number, w?: number, h?: number}>} subgraphs - Parsed subgraphs.
 * @param {string} [direction='TB'] - Flow direction.
 * @returns {void}
 */
export function layoutFlowchartClustered(nodes, edges, subgraphs, direction = 'TB') {
  const PAD = 24, LABEL = 26;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Only top-level subgraphs form clusters (a nested one is a subset of another).
  const isSubset = (a, b) => a.nodes.length < b.nodes.length && a.nodes.every(id => b.nodes.includes(id));
  const topLevel = subgraphs.filter(sg => !subgraphs.some(o => o !== sg && isSubset(sg, o)));

  const clusterOf = new Map(); // node id -> its top-level subgraph
  for (const sg of topLevel) for (const id of sg.nodes) if (nodeMap.has(id) && !clusterOf.has(id)) clusterOf.set(id, sg);

  // 1. Lay out each cluster internally; record local offsets and cluster size.
  const superNodes = [];
  const idToSuper = new Map();
  for (const sg of topLevel) {
    const members = sg.nodes.map(id => nodeMap.get(id)).filter(n => n && clusterOf.get(n.id) === sg);
    if (!members.length) continue;
    const innerEdges = edges.filter(e => clusterOf.get(e.from) === sg && clusterOf.get(e.to) === sg);
    layoutFlowchart(members, innerEdges, sg.direction || direction);
    const minX = Math.min(...members.map(m => m.x)), minY = Math.min(...members.map(m => m.y));
    for (const m of members) { m._lx = m.x - minX + PAD; m._ly = m.y - minY + LABEL + PAD; }
    const w = Math.max(...members.map(m => m._lx + m.w)) + PAD;
    const h = Math.max(...members.map(m => m._ly + m.h)) + PAD;
    const s = { id: `sg:${sg.id}`, w, h, kind: 'cluster', sg, members };
    superNodes.push(s);
    for (const m of members) idToSuper.set(m.id, s);
  }
  // Free nodes (not in any cluster) become their own super-nodes.
  for (const n of nodes) {
    if (clusterOf.has(n.id)) continue;
    const s = { id: n.id, w: n.w, h: n.h, kind: 'free', node: n };
    superNodes.push(s);
    idToSuper.set(n.id, s);
  }

  // 2. Coarse graph: one edge between distinct super-nodes (deduped).
  const seen = new Set();
  const coarseEdges = [];
  for (const e of edges) {
    const a = idToSuper.get(e.from), b = idToSuper.get(e.to);
    if (!a || !b || a === b) continue;
    const k = `${a.id}>${b.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    coarseEdges.push({ from: a.id, to: b.id });
  }

  // 3. Lay out the coarse graph, then 4. place members / free nodes / boxes.
  layoutFlowchart(superNodes, coarseEdges, direction);
  for (const s of superNodes) {
    if (s.kind === 'cluster') {
      for (const m of s.members) { m.x = s.x + m._lx; m.y = s.y + m._ly; }
      Object.assign(s.sg, { x: s.x, y: s.y, w: s.w, h: s.h });
    } else {
      s.node.x = s.x; s.node.y = s.y;
    }
  }
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
