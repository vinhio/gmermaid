/**
 * Renders a GitAST into SVG (commit nodes, branch lanes, parent/merge edges).
 * @module diagrams/git/renderer
 */
import { svgEl } from '../../core/renderer.js';

const STEP  = 60;  // horizontal distance between successive commit columns
const LANE  = 44;  // vertical distance between branch lanes (rows)
const PAD_X = 100; // wider left pad for branch labels
const PAD_Y = 40;  // top padding

/**
 * Map a commit's grid coords (`col`, `row`) to pixel position.
 * Columns advance left→right by STEP; rows (branch lanes) stack by LANE.
 * @param {{col: number, row: number}} commit - Commit with layout coords.
 * @returns {{x: number, y: number}} Pixel center of the commit node.
 */
function commitPos(commit) {
  return { x: PAD_X + commit.col * STEP, y: PAD_Y + commit.row * LANE };
}

/**
 * Render a GitAST: parent/merge edges into the edge layer (behind), then branch
 * labels, lane hints, and commit nodes (with HEAD rings, tags, and messages)
 * into the node layer. Clears both layers first.
 * @param {{commits: Array, branches: Array}} ast - GitAST from {@link parseGit}.
 * @param {SVGElement} nodeLayer - Layer for commit nodes and labels.
 * @param {SVGElement} edgeLayer - Layer for edges and lane hint lines (drawn behind nodes).
 * @returns {void}
 */
export function renderGit(ast, nodeLayer, edgeLayer) {
  nodeLayer.replaceChildren();
  edgeLayer.replaceChildren();

  const { commits, branches } = ast;
  if (!commits.length) return;

  const commitMap = new Map(commits.map(c => [c.id, c]));

  // Edges (draw in edgeLayer, behind nodes)
  const edgeG = svgEl('g');
  for (const commit of commits) {
    const to = commitPos(commit);
    const branchColor = branches.find(b => b.name === commit.branch)?.color ?? 'var(--gm-edge)';

    for (const parentId of commit.parents) {
      const parent = commitMap.get(parentId);
      if (!parent) continue;
      const from = commitPos(parent);

      let d;
      if (parent.row === commit.row) {
        // Same lane: straight horizontal line between the two columns.
        d = `M${from.x},${from.y} L${to.x},${to.y}`;
      } else {
        // Different lanes (branch/merge): S-curve via a cubic bezier whose
        // control points share the midpoint x of the two endpoints.
        const mx = (from.x + to.x) / 2;
        d = `M${from.x},${from.y} C${mx},${from.y} ${mx},${to.y} ${to.x},${to.y}`;
      }

      edgeG.appendChild(svgEl('path', {
        class: 'gm-git-edge',
        d,
        stroke: branchColor,
        'stroke-width': '2',
        fill: 'none',
        opacity: '0.7',
      }));
    }
  }
  edgeLayer.appendChild(edgeG);

  // Branch name labels on left
  for (const branch of branches) {
    const y = PAD_Y + branch.order * LANE;
    // Colored lane line hint
    const lastCommitOnBranch = [...commits].reverse().find(c => c.branch === branch.name);
    if (lastCommitOnBranch) {
      const endX = commitPos(lastCommitOnBranch).x;
      edgeLayer.appendChild(svgEl('line', {
        x1: PAD_X - 8, y1: y, x2: endX, y2: y,
        stroke: branch.color,
        'stroke-width': '1',
        opacity: '0.2',
        'stroke-dasharray': '2,4',
      }));
    }
    nodeLayer.appendChild(svgEl('text', {
      class: 'gm-git-branch-label',
      x: PAD_X - 12, y,
      'text-anchor': 'end',
      'dominant-baseline': 'middle',
      fill: branch.color,
      'font-weight': '600',
    }, branch.name));
  }

  // Commit nodes
  for (const commit of commits) {
    const { x, y } = commitPos(commit);
    const branchObj = branches.find(b => b.name === commit.branch);
    const color     = branchObj?.color ?? 'var(--gm-accent)';

    // HEAD indicator ring (a larger faint circle around the branch head commit)
    if (commit.isHead) {
      nodeLayer.appendChild(svgEl('circle', {
        class: 'gm-git-node',
        cx: x, cy: y, r: 14,
        fill: 'none',
        stroke: color,
        'stroke-width': '2',
        opacity: '0.5',
      }));
    }

    // Main circle
    const circle = svgEl('circle', {
      class: `gm-git-node${commit.type === 'HIGHLIGHT' ? ' gm-git-node-hi' : ''}`,
      cx: x, cy: y, r: 10,
      fill: commit.type === 'REVERSE' ? 'var(--gm-bg)' : color,
      stroke: color,
      'stroke-width': commit.type === 'REVERSE' ? '3' : '2',
    });
    nodeLayer.appendChild(circle);

    // Tag badge
    if (commit.tag) {
      const tw = commit.tag.length * 6 + 12;
      const tagG = svgEl('g', { transform: `translate(${x - tw/2},${y - 28})` });
      tagG.appendChild(svgEl('rect', {
        x: 0, y: 0, width: tw, height: 16,
        fill: color, rx: 3, opacity: '0.85',
      }));
      tagG.appendChild(svgEl('text', {
        class: 'gm-git-tag',
        x: tw / 2, y: 8,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        fill: 'var(--gm-bg)',
      }, commit.tag));
      nodeLayer.appendChild(tagG);
    }

    // Message label
    if (commit.msg) {
      const truncated = commit.msg.length > 20 ? commit.msg.slice(0, 19) + '…' : commit.msg;
      nodeLayer.appendChild(svgEl('text', {
        class: 'gm-git-label',
        x, y: y + 22,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      }, truncated));
    }
  }
}
