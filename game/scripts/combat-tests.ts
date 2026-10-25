#!/usr/bin/env node
/* Combat behaviour tests. No browser, no engine — the simulation is pure, so
 * every claim about gunnery can be checked directly.
 *
 * These assert the things that would otherwise only be caught by playing:
 * that shots land where they are aimed, that you cannot shoot through your
 * own bow, that ammo types do different jobs, and that the AI can actually
 * hit something.
 */

import { World } from '../src/sim/world.ts';
import { elevationForRange, timeOfFlight, MUZZLE_SPEED, MAX_RANGE } from '../src/sim/ballistics.ts';
import { AMMO, DAMAGE_PER_BALL, hitsShip, rigEfficiency } from '../src/sim/combat.ts';
import { botCommand, newBotMemory } from '../src/sim/bot.ts';
import { armedMountFor, LOOK_ARCS } from '../src/sim/lookSector.ts';
import { SHIP_CLASSES } from '../src/data/shipClasses.ts';
import type { Command } from '../src/sim/types.ts';
import { TICK_HZ } from '../src/sim/types.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`  ok    ${name}${detail ? '  — ' + detail : ''}`);
  else { console.error(`  FAIL  ${name}  ${detail}`); failures++; }
}

const hold = (over: Partial<Command> = {}): Command => ({
  seq: 0, turn: 0, sail: 0, fire: null, aimRange: 120, ammo: 'round', aimHold: 0, ...over,
});

/* --- ballistics ------------------------------------------------------- */
console.log('\nballistics');
{
  // Integrate a shot fired at a known elevation over flat water and see where
  // it comes down. This is the check that the range equation and the
  // integrator actually agree with each other.
  for (const range of [60, 120, 200, 250]) {
    const theta = elevationForRange(range);
    let x = 0, y = 0;
    let vx = MUZZLE_SPEED * Math.cos(theta);
    let vy = MUZZLE_SPEED * Math.sin(theta);
    const dt = 1 / TICK_HZ;
    let guard = 0;
    while (y >= 0 && guard++ < 10000) {
      vy -= 9.81 * dt;
      x += vx * dt;
      y += vy * dt;
    }
    const err = Math.abs(x - range);
    // Fixed-step integration overshoots slightly; a few metres at 250 m is
    // well inside the volley's own spread.
    check(`shot aimed at ${range} m lands at ${x.toFixed(1)} m`, err < 6, `error ${err.toFixed(2)} m`);
  }

  check('range is capped', elevationForRange(9999) === elevationForRange(MAX_RANGE));
  check('time of flight rises with range', timeOfFlight(200) > timeOfFlight(60),
    `${timeOfFlight(60).toFixed(2)}s vs ${timeOfFlight(200).toFixed(2)}s`);
}

/* --- firing arc ------------------------------------------------------- */
console.log('\nfiring arc');
{
  // A target dead ahead must be unreachable: the guns point off the beam and
  // cannot be swung. This is the rule the whole steering game rests on.
  const w = new World({ weather: 'clear' });
  w.addShip(1, 'frigate', 0, 0, 0);       // pointing along +Z
  w.addShip(2, 'brig', 0, 120, 0);        // dead ahead
  w.ships[1].speed = 0;

  for (let t = 0; t < TICK_HZ * 8; t++) {
    w.applyCommand(1, hold({ fire: t === 0 ? 'starboard' : null, aimRange: 120 }));
    w.step();
  }
  check('target dead ahead takes no damage from a broadside',
    w.ships[1].hull === 1, `hull ${w.ships[1].hull.toFixed(3)}`);

  // Same geometry, target on the beam: must be hit.
  const w2 = new World({ weather: 'clear' });
  w2.addShip(1, 'frigate', 0, 0, 0);
  w2.addShip(2, 'brig', 120, 0, 0);       // off the starboard beam
  for (let t = 0; t < TICK_HZ * 8; t++) {
    w2.applyCommand(1, hold({ fire: t === 0 ? 'starboard' : null, aimRange: 120 }));
    w2.step();
  }
  check('target on the beam is hit', w2.ships[1].hull < 1, `hull ${w2.ships[1].hull.toFixed(3)}`);

  // Bow chasers are the one way to hit a target dead ahead — the whole point
  // of the look-directed sector scheme. Same geometry as the first check,
  // opposite expectation.
  const w3 = new World({ weather: 'clear' });
  w3.addShip(1, 'frigate', 0, 0, 0);
  w3.addShip(2, 'brig', 0, 120, 0);       // dead ahead
  for (let t = 0; t < TICK_HZ * 8; t++) {
    w3.applyCommand(1, hold({ fire: t === 0 ? 'bow' : null, aimRange: 120 }));
    w3.step();
  }
  check('bow chasers hit a target dead ahead', w3.ships[1].hull < 1,
    `hull ${w3.ships[1].hull.toFixed(3)}`);
  check('bow chasers damage rigging even when ammo is round shot (always chain)',
    w3.ships[1].rig < 1, `rig ${w3.ships[1].rig.toFixed(3)}`);
}

/* --- ammo types ------------------------------------------------------- */
console.log('\nammo');
{
  function volleyInto(ammo: 'round' | 'chain') {
    const w = new World({ weather: 'clear' });
    w.addShip(1, 'frigate', 0, 0, 0);
    w.addShip(2, 'brig', 120, 0, 0);
    for (let t = 0; t < TICK_HZ * 8; t++) {
      w.applyCommand(1, hold({ fire: t === 0 ? 'starboard' : null, aimRange: 120, ammo }));
      w.step();
    }
    return { hull: 1 - w.ships[1].hull, rig: 1 - w.ships[1].rig };
  }
  const round = volleyInto('round');
  const chain = volleyInto('chain');

  check('round shot damages hull more than chain', round.hull > chain.hull * 2,
    `round ${round.hull.toFixed(3)} vs chain ${chain.hull.toFixed(3)}`);
  check('chain shot damages rigging more than round', chain.rig > round.rig * 2,
    `chain ${chain.rig.toFixed(3)} vs round ${round.rig.toFixed(3)}`);
  check('ammo mix is declared consistently',
    AMMO.round.hull > AMMO.chain.hull && AMMO.chain.rig > AMMO.round.rig);
}

/* --- rigging damage slows a ship -------------------------------------- */
console.log('\nrigging damage');
{
  function topSpeed(rig: number): number {
    const w = new World({ weather: 'fair', windFrom: Math.PI });
    w.addShip(1, 'brig', 0, 0, 0); // running with the wind
    w.ships[0].rig = rig;
    for (let t = 0; t < TICK_HZ * 40; t++) {
      w.applyCommand(1, hold({ sail: 1 }));
      w.step();
      w.ships[0].rig = rig; // hold it there; nothing else damages it here
    }
    return w.ships[0].speed;
  }
  const healthy = topSpeed(1);
  const shredded = topSpeed(0);
  check('shredded rigging is slower than healthy', shredded < healthy * 0.75,
    `${shredded.toFixed(2)} vs ${healthy.toFixed(2)} m/s`);
  check('a dismasted ship still moves', shredded > 0.5,
    `${shredded.toFixed(2)} m/s — it drifts, it is not a rock`);
  check('rig efficiency floor holds', rigEfficiency(0) > 0 && rigEfficiency(1) === 1);
}

/* --- sinking and respawn ---------------------------------------------- */
console.log('\nsinking');
{
  const w = new World({ weather: 'clear' });
  w.addShip(1, 'galleon', 0, 0, 0);
  w.addShip(2, 'sloop', 100, 0, 0);
  let sunkSeen = false;
  let minHull = 1;

  for (let t = 0; t < TICK_HZ * 60 && !sunkSeen; t++) {
    // Aim at where the target actually is. Sending no command at all would
    // leave the target under full sail, drifting out of the aim point — the
    // gunner has to keep ranging, exactly as a player does.
    const target = w.ships[1];
    const range = Math.hypot(target.x - w.ships[0].x, target.z - w.ships[0].z);
    w.applyCommand(1, hold({ fire: 'starboard', aimRange: range }));
    w.applyCommand(2, hold({ sail: 0 }));
    w.step();
    minHull = Math.min(minHull, w.ships[1].hull);
    if (w.snapshot().events.some((e) => e.kind === 'sunk')) sunkSeen = true;
  }
  check('a galleon sinks a sloop', sunkSeen, `lowest hull ${minHull.toFixed(3)}`);
  check('sinking ship is marked as such', w.ships[1].sinking > 0);

  // Cease fire and let the wreck go down, or the respawned ship is simply
  // shot again and the check measures nothing.
  const sinkingFor = w.ships[1].sinking;
  for (let t = 0; t <= sinkingFor + 2; t++) {
    w.applyCommand(1, hold({ fire: null }));
    w.step();
  }
  check('sunk ship respawns at full health',
    w.ships[1].hull === 1 && w.ships[1].rig === 1 && w.ships[1].sinking === 0,
    `hull ${w.ships[1].hull.toFixed(2)} sinking ${w.ships[1].sinking}`);
}

/* --- the AI can actually fight ---------------------------------------- */
console.log('\nbot');
{
  // "It fires" proves nothing; the bar is that it lands hits on its own.
  const w = new World({ weather: 'fair' });
  w.addShip(1, 'brig', 0, 0, 0);          // stationary target, sails furled
  w.addShip(2, 'brig', 140, 40, Math.PI, true);
  let hits = 0;

  for (let t = 0; t < TICK_HZ * 90; t++) {
    w.applyCommand(1, hold({ sail: 0 }));
    w.step();
    hits += w.snapshot().events.filter((e) => e.kind === 'impact' && e.shipId === 1).length;
  }
  check('bot lands hits on a stationary target', hits > 0, `${hits} hits in 90 s`);
  check('bot damaged the target', w.ships[0].hull < 1 || w.ships[0].rig < 1,
    `hull ${w.ships[0].hull.toFixed(2)} rig ${w.ships[0].rig.toFixed(2)}`);
}

console.log('\nbot bow chasers');
{
  const w = new World({ weather: 'fair' });
  w.addShip(1, 'brig', 0, 120, Math.PI);   // target 120 m dead ahead of the bot
  w.addShip(2, 'brig', 0, 0, 0, true);
  const [target, bot] = w.ships;
  const fresh = () => newBotMemory();
  check('bot fires bow chasers at a target dead ahead', botCommand(bot, target, fresh()).fire === 'bow');
  bot.reloadBow = 0.5;
  check('bot holds fire while the bow chasers reload', botCommand(bot, target, fresh()).fire === null);
  bot.reloadBow = 1;
  target.x = 60;                            // ~27 degrees off the bow: no gun bears
  check('bot does not fire bow chasers at an off-axis target', botCommand(bot, target, fresh()).fire === null);
  target.x = 120; target.z = 0;             // abeam to starboard: broadside wins
  check('bot prefers a broadside when one bears', botCommand(bot, target, fresh()).fire === 'starboard');
}

/* --- fire orders survive a slow client -------------------------------- */
console.log('\ncommand coalescing');
{
  // Several commands arriving between two ticks is normal whenever the client
  // renders slower than the sim ticks. The fire order must not be lost.
  const w = new World({ weather: 'clear' });
  w.addShip(1, 'frigate', 0, 0, 0);
  w.addShip(2, 'brig', 120, 0, 0);

  w.applyCommand(1, hold({ fire: 'starboard', aimRange: 120 }));
  w.applyCommand(1, hold({ fire: null, aimRange: 120 })); // later frame, no key
  w.applyCommand(1, hold({ fire: null, aimRange: 120 }));
  w.step();
  const fired = w.snapshot().events.some((e) => e.kind === 'muzzle');
  check('fire order survives being coalesced with later commands', fired);

  // And the newest continuous intent still wins.
  const w2 = new World({ weather: 'clear' });
  w2.addShip(1, 'frigate', 0, 0, 0);
  w2.applyCommand(1, hold({ turn: -1, sail: 0 }));
  w2.applyCommand(1, hold({ turn: 1, sail: 1 }));
  w2.step();
  check('newest steering still wins when commands coalesce', w2.ships[0].heading > 0,
    `heading ${w2.ships[0].heading.toFixed(4)}`);
}

/* --- hit volume sanity ------------------------------------------------ */
console.log('\nhit volume');
{
  const w = new World();
  w.addShip(1, 'brig', 0, 0, 0);
  const s = w.ships[0];
  const geo = SHIP_CLASSES.brig.geo;
  check('centre of the ship is a hit', hitsShip(s, 0, 0, 0));
  check('a point beyond the bow misses', !hitsShip(s, 0, 0, geo.len));
  check('a point beyond the beam misses', !hitsShip(s, geo.beam, 0, 0));
  check('a point high above the masts misses', !hitsShip(s, 0, geo.mastH * 2, 0));
  s.sinking = 10;
  check('a sinking ship cannot be hit again', !hitsShip(s, 0, 0, 0));
}

/* --- volley weight matches the design table --------------------------- */
console.log('\nvolley weight');
{
  for (const id of ['sloop', 'brig', 'frigate', 'galleon'] as const) {
    const c = SHIP_CLASSES[id].combat;
    const volley = c.gunsPerSide * DAMAGE_PER_BALL;
    const volleysToSink = c.hullHp / volley;
    console.log(`  ${id.padEnd(8)} volley ${String(volley).padStart(5)}  ` +
      `self-sink in ${volleysToSink.toFixed(1)} volleys`);
  }
  check('heavier classes hit harder',
    SHIP_CLASSES.galleon.combat.gunsPerSide > SHIP_CLASSES.frigate.combat.gunsPerSide &&
    SHIP_CLASSES.frigate.combat.gunsPerSide > SHIP_CLASSES.brig.combat.gunsPerSide &&
    SHIP_CLASSES.brig.combat.gunsPerSide > SHIP_CLASSES.sloop.combat.gunsPerSide);
  check('heavier classes reload slower',
    SHIP_CLASSES.galleon.combat.reloadSec > SHIP_CLASSES.sloop.combat.reloadSec);
}

/* --- stern drop weapon -------------------------------------------------- */
console.log('\ndrop weapon');
{
  // A ship following close astern should take blast damage when the charge
  // lands; one well outside the radius should not — this is what the stern
  // sector buys over a plain cannonball.
  function dropInto(followerRange: number): number {
    const w = new World({ weather: 'clear' });
    w.addShip(1, 'brig', 0, 0, 0);               // heading along +Z
    w.addShip(2, 'brig', 0, -followerRange, 0);  // directly astern
    for (let t = 0; t < TICK_HZ * 6; t++) {
      w.applyCommand(1, hold({ fire: t === 0 ? 'stern' : null }));
      w.applyCommand(2, hold({ sail: 0 }));
      w.step();
    }
    return 1 - w.ships[1].hull;
  }

  const close = dropInto(5);
  const far = dropInto(80);
  check('a ship following close astern takes drop-weapon damage', close > 0, `hull loss ${close.toFixed(3)}`);
  check('a ship well clear of the blast radius takes none', far === 0, `hull loss ${far.toFixed(3)}`);
}

/* --- look-directed sector arcs ------------------------------------------ */
console.log('\nlook sectors');
{
  // Same invariant verify-controls-mockup.mjs checks against the prototype's
  // copy of this arithmetic — asserted here against the real lookSector.ts
  // so the two tables can't quietly drift apart.
  const total = LOOK_ARCS.reduce((sum, a) => sum + (a.to - a.from), 0);
  check('LOOK_ARCS tiles 360 degrees exactly', total === 360, `total ${total}`);

  let bad = 0;
  for (let b = -180; b <= 180; b += 0.5) {
    const picked = armedMountFor(b, null);
    if (!LOOK_ARCS.some((a) => a.id === picked)) bad++;
  }
  check('every bearing resolves to a covered sector with no prior state', bad === 0, `${bad} uncovered`);

  // Hysteresis: a bearing resting exactly on a seam must not flicker —
  // whichever sector currently holds it keeps it until it clears the band.
  const seam = 30; // bow/starboard boundary
  check('a seam bearing keeps the previously-armed sector',
    armedMountFor(seam, 'bow') === 'bow' && armedMountFor(seam, 'starboard') === 'starboard');
  check('a bearing well clear of the seam ignores stale state',
    armedMountFor(90, 'bow') === 'starboard');
}

console.log('');
if (failures > 0) {
  console.error(`${failures} combat check(s) failed`);
  process.exit(1);
}
console.log('all combat checks passed');
