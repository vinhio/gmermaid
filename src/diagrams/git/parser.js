/**
 * Parses Mermaid gitGraph syntax into a GitAST.
 * @module diagrams/git/parser
 */

/** Hue values (oklch) cycled across branches by their declaration order. */
const BRANCH_HUES = [160, 220, 45, 330, 90, 270];

/**
 * Color for a branch, chosen by its order index.
 * @param {number} order - Branch order (lane index).
 * @returns {string} An oklch color string.
 */
function branchColor(order) {
  return `oklch(0.65 0.17 ${BRANCH_HUES[order % BRANCH_HUES.length]})`;
}

/**
 * Extract a quoted attribute value (`key:"value"`) from a line.
 * @param {string} str - The source line.
 * @param {string} key - Attribute name (e.g. 'id', 'msg', 'tag').
 * @returns {string|null} The quoted value, or null if absent.
 */
function parseAttr(str, key) {
  const m = str.match(new RegExp(`${key}:\\s*"([^"]+)"`));
  return m ? m[1] : null;
}

/**
 * Extract a bare-word attribute value (`key:word`) from a line.
 * @param {string} str - The source line.
 * @param {string} key - Attribute name (e.g. 'type').
 * @returns {string|null} The word value, or null if absent.
 */
function parseAttrWord(str, key) {
  const m = str.match(new RegExp(`${key}:\\s*(\\w+)`));
  return m ? m[1] : null;
}

/**
 * Parse Mermaid gitGraph text into a GitAST.
 *
 * Walks the commands (`commit`, `branch`, `checkout`/`switch`, `merge`,
 * `cherry-pick`) maintaining a current branch and per-branch head. Each commit
 * gets a sequential column (`col`, x-position order) and a row equal to its
 * branch's order (the lane it is drawn on). Parent links connect a commit to
 * its branch head (plus the source branch head for merges).
 *
 * @param {string} text - Raw Mermaid gitGraph source.
 * @returns {{
 *   type: 'git',
 *   commits: Array<{id: string, msg: string, tag: (string|null), type: string, branch: string, parents: string[], col: number, row: number, isHead: boolean}>,
 *   branches: Array<{name: string, order: number, color: string}>,
 *   maxCol: number
 * }} GitAST. `commits` carry layout coords (`col`/`row`) and an `isHead` flag;
 *   `branches` are sorted by `order`; `maxCol` is the total commit count (chart width).
 */
export function parseGit(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));

  const branches  = new Map(); // name → { name, order, color }
  const commits   = [];
  const branchHead = new Map(); // name → last commit id
  let   currentBranch = 'main';
  let   direction = 'LR';
  let   col = 0;
  let   commitCounter = 0;

  /**
   * Look up a branch by name, creating it (with a color and lane order) if new.
   * @param {string} name - Branch name.
   * @param {number} [order] - Explicit lane order; defaults to current branch count.
   * @returns {{name: string, order: number, color: string}} The branch record.
   */
  function ensureBranch(name, order) {
    if (!branches.has(name)) {
      branches.set(name, { name, order: order ?? branches.size, color: branchColor(order ?? branches.size) });
    }
    return branches.get(name);
  }
  ensureBranch('main', 0);

  for (const line of lines) {
    const headM = line.match(/^gitGraph\s*(?:(TB|BT|LR)\b)?/i);
    if (headM) { if (headM[1]) direction = headM[1].toUpperCase(); continue; }

    if (/^commit\b/i.test(line)) {
      const id  = parseAttr(line, 'id') ?? `c${++commitCounter}`;
      const msg = parseAttr(line, 'msg') ?? '';
      const tag = parseAttr(line, 'tag') ?? null;
      const type = parseAttrWord(line, 'type')?.toUpperCase() ?? 'NORMAL';
      const branch = ensureBranch(currentBranch);
      const parents = branchHead.has(currentBranch) ? [branchHead.get(currentBranch)] : [];

      commits.push({ id, msg, tag, type, branch: currentBranch, parents, col: col++, row: branch.order });
      branchHead.set(currentBranch, id);
      continue;
    }

    if (/^branch\b/i.test(line)) {
      const parts = line.split(/\s+/);
      const name  = parts[1];
      if (!name) continue;
      const orderM = line.match(/order:\s*(\d+)/);
      const order  = orderM ? +orderM[1] : branches.size;
      ensureBranch(name, order);
      // Branch head starts from current branch head, and `branch` switches to it.
      if (!branchHead.has(name) && branchHead.has(currentBranch)) {
        branchHead.set(name, branchHead.get(currentBranch));
      }
      currentBranch = name;
      continue;
    }

    if (/^(?:checkout|switch)\b/i.test(line)) {
      const parts = line.split(/\s+/);
      const name  = parts[1];
      if (name) { ensureBranch(name); currentBranch = name; }
      continue;
    }

    if (/^merge\b/i.test(line)) {
      const parts = line.split(/\s+/);
      const src   = parts[1];
      if (!src) continue;
      const id  = parseAttr(line, 'id') ?? `m${++commitCounter}`;
      const tag = parseAttr(line, 'tag') ?? null;
      const type = parseAttrWord(line, 'type')?.toUpperCase() ?? 'NORMAL';
      // A merge commit has two parents: the current branch head and the source head.
      const srcHead = branchHead.get(src) ?? null;
      const dstHead = branchHead.get(currentBranch) ?? null;
      const parents = [dstHead, srcHead].filter(Boolean);
      const branch  = ensureBranch(currentBranch);
      commits.push({ id, msg: `Merge ${src}`, tag, type, isMerge: true, branch: currentBranch, parents, col: col++, row: branch.order });
      branchHead.set(currentBranch, id);
      continue;
    }

    if (/^cherry-pick\b/i.test(line)) {
      const srcId  = parseAttr(line, 'id');
      const parent = parseAttr(line, 'parent'); // parent of the cherry-picked commit (for merge commits)
      const id     = `cp${++commitCounter}`;
      const branch = ensureBranch(currentBranch);
      // Parents: the current head, plus a dashed link back to the source commit.
      const parents = branchHead.has(currentBranch) ? [branchHead.get(currentBranch)] : [];
      const tag = srcId ? `cherry-pick:${srcId}` : null;
      commits.push({ id, msg: '', tag, type: 'NORMAL', cherryFrom: srcId ?? null, cherryParent: parent ?? null, branch: currentBranch, parents, col: col++, row: branch.order });
      branchHead.set(currentBranch, id);
      continue;
    }
  }

  // The current head id of every branch marks a HEAD commit (drawn with a ring).
  const headSet = new Set(branchHead.values());

  return {
    type: 'git',
    direction,
    commits: commits.map(c => ({ ...c, isHead: headSet.has(c.id) })),
    branches: [...branches.values()].sort((a, b) => a.order - b.order),
    maxCol: col,
  };
}
