#!/usr/bin/env node
/* Determinism check.
 *
 * The same seed and the same command log must produce the same world, every
 * time. Without this an authoritative server and its clients drift, and the
 * drift shows up as rubber-banding that is miserable to debug after the fact.
 */

import { World } from '../src/sim/world.ts';
import type { Command } from '../src/sim/types.ts';
import { SHIP_CLASS_ORDER } from '../src/data/shipClasses.ts';
import { WEATHER_ORDER } from '../src/data/weather.ts';

/** Deterministic pseudo-random command stream — no Math.random anywhere. */
function makeCommands(count: number): Command[] {
  const cmds: Command[] = [];
  let a = 12345;
  for (let i = 0; i < count; i++) {
    a = (a * 1664525 + 1013904223) >>> 0;
    const r = a / 4294967296;
    cmds.push({ seq: i, turn: r * 2 - 1, sail: 0.4 + (r * 3) % 0.6 });
  }
  return cmds;
}

function run(ticks: number, cmds: Command[]): string {
  const w = new World({ weather: 'fair', windFrom: Math.PI * 0.25 });
  w.addShip(1, 'brig', 0, 0, 0);
  w.addShip(2, 'frigate', 40, 30, Math.PI, true);
  for (let t = 0; t < ticks; t++) {
    w.applyCommand(1, cmds[t]);
    // Exercise class and weather switches too — they mutate state mid-run.
    if (t === 120) w.applyControl({ kind: 'setClass', shipId: 1, cls: 'galleon' });
    if (t === 240) w.applyControl({ kind: 'setWeather', weather: 'storm' });
    w.step();
  }
  return w.hash();
}

const TICKS = 600;
const cmds = makeCommands(TICKS);

const a = run(TICKS, cmds);
const b = run(TICKS, cmds);

if (a !== b) {
  console.error('FAIL: simulation is not deterministic');
  console.error('  run A:', a.slice(0, 160));
  console.error('  run B:', b.slice(0, 160));
  process.exit(1);
}

// Sanity: the world must actually have gone somewhere, or we are comparing
// two identical piles of zeroes and proving nothing.
const moved = run(TICKS, cmds).split('|');
const x = Number(moved[5]);
const z = Number(moved[6]);
if (!Number.isFinite(x) || !Number.isFinite(z) || (Math.abs(x) < 1 && Math.abs(z) < 1)) {
  console.error('FAIL: ship did not move — determinism check is vacuous');
  console.error('  state:', moved.slice(0, 10).join('|'));
  process.exit(1);
}

// And every class / weather must be reachable from the tables the sim reads.
if (SHIP_CLASS_ORDER.length !== 4 || WEATHER_ORDER.length !== 5) {
  console.error('FAIL: unexpected roster or weather table size');
  process.exit(1);
}

console.log(`determinism OK — ${TICKS} ticks, identical hash across runs`);
console.log(`  ship 1 ended at x=${x.toFixed(2)} z=${z.toFixed(2)}`);
