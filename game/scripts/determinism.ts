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
    // Fire whenever the guns bear-ish, cycling mounts, so the log drives a
    // real fight rather than a pleasure cruise.
    const fire: Command['fire'] = i % 40 === 0 ? 'starboard'
      : i % 67 === 0 ? 'port'
        : i % 101 === 0 ? 'bow'
          : i % 149 === 0 ? 'stern' : null;
    cmds.push({
      seq: i,
      turn: r * 2 - 1,
      sail: 0.4 + (r * 3) % 0.6,
      fire,
      aimRange: 60 + r * 160,
      ammo: r > 0.6 ? 'chain' : 'round',
      aimHold: r,
    });
  }
  return cmds;
}

interface RunResult { hash: string; hits: number; sinks: number; shots: number }

function run(ticks: number, cmds: Command[]): RunResult {
  // A duel, not a cruise: a scripted player against the AI, with real hits.
  // Projectiles and reload timers are exactly the kind of state that drifts,
  // so the fight is the thing worth hashing.
  const w = new World({ weather: 'fair', windFrom: Math.PI * 0.25 });
  w.addShip(1, 'brig', 0, 0, 0);
  w.addShip(2, 'brig', 90, 40, Math.PI, true);
  let hits = 0, sinks = 0, shots = 0;

  for (let t = 0; t < ticks; t++) {
    w.applyCommand(1, cmds[t]);
    // Exercise class and weather switches too — they mutate state mid-run.
    if (t === 400) w.applyControl({ kind: 'setClass', shipId: 1, cls: 'galleon' });
    if (t === 700) w.applyControl({ kind: 'setWeather', weather: 'storm' });
    w.step();
    for (const e of w.snapshot().events) {
      if (e.kind === 'impact') hits++;
      else if (e.kind === 'sunk') sinks++;
      else if (e.kind === 'muzzle') shots++;
    }
  }
  return { hash: w.hash(), hits, sinks, shots };
}

const TICKS = 1800; // 60 s of fighting
const cmds = makeCommands(TICKS);

const a = run(TICKS, cmds);
const b = run(TICKS, cmds);

if (a.hash !== b.hash) {
  console.error('FAIL: simulation is not deterministic');
  console.error('  run A:', a.hash.slice(0, 200));
  console.error('  run B:', b.hash.slice(0, 200));
  process.exit(1);
}

// A duel that never fired proves nothing about projectile determinism.
if (a.shots === 0 || a.hits === 0) {
  console.error(`FAIL: duel was vacuous — ${a.shots} volleys, ${a.hits} hits`);
  process.exit(1);
}

// Sanity: the world must actually have gone somewhere, or we are comparing
// two identical piles of zeroes and proving nothing.
const moved = run(TICKS, cmds).hash.split('|');
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
console.log(`  duel: ${a.shots} volleys, ${a.hits} hits, ${a.sinks} sinkings`);
