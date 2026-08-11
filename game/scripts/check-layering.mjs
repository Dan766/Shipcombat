#!/usr/bin/env node
/* Enforces the one rule the netcode foundation rests on: the simulation and
 * the data tables never import the rendering engine.
 *
 * If this ever fails, the sim can no longer run on a server, and "structured
 * for multiplayer" has quietly stopped being true. */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const GUARDED = ['src/sim', 'src/data', 'src/net'];
const FORBIDDEN = /from\s+['"](@babylonjs|babylonjs)/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

let violations = 0;
let checked = 0;

for (const guarded of GUARDED) {
  let files;
  try {
    files = walk(join(root, guarded));
  } catch {
    continue;
  }
  for (const file of files) {
    checked++;
    const src = readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (FORBIDDEN.test(line)) {
        console.error(`  ${relative(root, file)}:${i + 1}  ${line.trim()}`);
        violations++;
      }
    });
  }
}

if (violations > 0) {
  console.error(`\nFAIL: ${violations} engine import(s) in simulation/data/net layers.`);
  console.error('These layers must stay engine-free so the sim can run on a server.');
  process.exit(1);
}

console.log(`layering OK — ${checked} files in ${GUARDED.join(', ')} are engine-free`);
