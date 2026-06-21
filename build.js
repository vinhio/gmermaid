/**
 * Build script — bundles gMermaid into dist/
 *
 * Run: node build.js
 * Outputs:
 *   dist/gmermaid.js       — ES module bundle (unminified)
 *   dist/gmermaid.min.js   — ES module bundle (minified)
 *   dist/gmermaid.css      — Default (dark) theme
 */

import { build, context } from 'esbuild';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT   = join(__dir, 'dist');

const watch = process.argv.includes('--watch');

async function run() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

  const sharedOpts = {
    entryPoints: [join(__dir, 'src/index.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    // No external deps — bundle everything
  };

  // Unminified
  if (watch) {
    const ctx = await context({ ...sharedOpts, outfile: join(OUT, 'gmermaid.js'), sourcemap: true });
    await ctx.watch();
    console.log('  watching for changes…');
  } else {
    await build({ ...sharedOpts, outfile: join(OUT, 'gmermaid.js'), sourcemap: true });
  }

  // Minified (not in watch mode — rebuilt on demand)
  if (!watch) {
    await build({ ...sharedOpts, outfile: join(OUT, 'gmermaid.min.js'), minify: true });
  }

  // Copy default (dark) theme as gmermaid.css
  await copyFile(join(__dir, 'themes/dark.css'), join(OUT, 'gmermaid.css'));

  console.log('✓ dist/gmermaid.js');
  console.log('✓ dist/gmermaid.min.js');
  console.log('✓ dist/gmermaid.css');
  if (watch) console.log('  watching for changes…');
}

run().catch(err => { console.error(err); process.exit(1); });
