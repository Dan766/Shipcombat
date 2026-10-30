#!/usr/bin/env node
/* Combat behaviour tests. No browser, no engine — the simulation is pure, so
 * every claim about gunnery can be checked directly.
 *
 * These assert the things that would otherwise only be caught by playing:
 * that shots land where they are aimed, that you cannot shoot through your
 * own bow, that ammo types do different jobs, and that the AI can actually
 * hit something.
 */

import { World, ARENA_HALF } from '../src/sim/world.ts';
import { elevationForRange, timeOfFlight, stepProjectile, MUZZLE_SPEED, MAX_RANGE, MIN_RANGE, GRAVITY, type Projectile } from '../src/sim/ballistics.ts';
import { AMMO, DAMAGE_PER_BALL, hitsShip, DROP_RADIUS, rigEfficiency, applyHit, fireVolley, fireDropWeapon } from '../src/sim/combat.ts';
import { botCommand, newBotMemory } from '../src/sim/bot.ts';
import { pointOfSail, pointOfSailName, angleOffWind, normalizeAngle } from '../src/sim/wind.ts';
import { waveHeight, waveNormal } from '../src/sim/waves.ts';
import { armedMountFor, LOOK_ARCS, LOOK_HYSTERESIS_DEG } from '../src/sim/lookSector.ts';
import { WEATHER, WEATHER_ORDER, type WeatherId } from '../src/data/weather.ts';
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

console.log('\nbot stern drop weapon');
{
  const w = new World({ weather: 'fair' });
  w.addShip(1, 'brig', 0, -14, 0);          // follower 14 m dead astern of the bot
  w.addShip(2, 'brig', 0, 0, 0, true);
  const [target, bot] = w.ships;
  const fresh = () => newBotMemory();
  check('bot drops the stern charge on a close follower', botCommand(bot, target, fresh()).fire === 'stern');
  bot.reloadStern = 0.5;
  check('bot holds the charge while it reloads', botCommand(bot, target, fresh()).fire !== 'stern');
  bot.reloadStern = 1;
  target.z = -60;
  check('bot keeps the charge for a distant follower', botCommand(bot, target, fresh()).fire !== 'stern');
  target.z = 0; target.x = 14;              // abeam: not astern
  check('bot does not drop the charge on a beam target', botCommand(bot, target, fresh()).fire !== 'stern');
}

/* --- the bot lays its guns like a player holding aim ------------------ */
console.log('\nbot aim hold');
{
  const w = new World({ weather: 'fair' });
  w.addShip(1, 'brig', 120, 0, 0);            // 120 m off the bot's starboard beam
  w.addShip(2, 'brig', 0, 0, 0, true);
  const [target, bot] = w.ships;
  bot.reloadStbd = 0;                          // reloading: no shot, aim keeps building
  const mem = newBotMemory();
  const first = botCommand(bot, target, mem).aimHold;
  for (let i = 0; i < TICK_HZ; i++) botCommand(bot, target, mem);
  const held = botCommand(bot, target, mem).aimHold;
  check('aim builds while a broadside bears, even mid-reload', first > 0 && held === 1,
    `${first.toFixed(3)} -> ${held.toFixed(2)}`);
  bot.reloadStbd = 1;
  const shot = botCommand(bot, target, mem);
  check('the shot goes off at full aim', shot.fire === 'starboard' && shot.aimHold === 1);
  check('aim is spent by firing', botCommand(bot, target, mem).aimHold < 0.1);
  target.z = 400;                              // slides off the beam
  check('aim is lost when the target leaves the arc', botCommand(bot, target, mem).aimHold === 0);
}

/* --- a losing bot breaks off ------------------------------------------ */
console.log('\nbot disengage');
{
  const w = new World({ weather: 'fair' });
  w.addShip(1, 'brig', 120, 0, 0);            // 120 m off the bot's starboard beam
  w.addShip(2, 'brig', 0, 0, 0, true);
  const [target, bot] = w.ships;
  const circling = botCommand(bot, target, newBotMemory());
  check('a healthy bot holds the beam', Math.abs(circling.turn) < 0.2, `turn ${circling.turn.toFixed(2)}`);
  bot.hull = 0.2;
  const fleeing = botCommand(bot, target, newBotMemory());
  check('a badly hurt, losing bot turns away', fleeing.turn < -0.9, `turn ${fleeing.turn.toFixed(2)}`);
  check('it still fires a broadside that bears', fleeing.fire === 'starboard');
  target.hull = 0.1;
  check('a hurt bot that is winning keeps fighting (turns in, not away)', botCommand(bot, target, newBotMemory()).turn > -0.2);
}

console.log('\nbot flee vs wind');
{
  // Target dead ahead (+z) of the bot, so "away" is due south (heading PI).
  const w = new World({ weather: 'fair' });
  w.addShip(1, 'brig', 0, 200, 0);
  w.addShip(2, 'brig', 0, 0, Math.PI, true);
  const [target, bot] = w.ships;
  bot.hull = 0.2;
  const beam = botCommand(bot, target, newBotMemory(), Math.PI / 2);
  check('with the wind abeam it runs straight away', Math.abs(beam.turn) < 0.05, `turn ${beam.turn.toFixed(2)}`);
  const unaware = botCommand(bot, target, newBotMemory());
  check('without wind info it runs straight away', Math.abs(unaware.turn) < 0.05);
  const a = botCommand(bot, target, newBotMemory(), Math.PI - 0.1);
  check('away heading dead into the wind: bears off (positive side)', a.turn > 0.9, `turn ${a.turn.toFixed(2)}`);
  const b = botCommand(bot, target, newBotMemory(), Math.PI + 0.1);
  check('bears off to the other side when the wind is on that side', b.turn < -0.9, `turn ${b.turn.toFixed(2)}`);
  // The bear-off heading has real way on: >= close-hauled speed, not irons.
  check('the bear-off heading is out of irons', pointOfSail(0.87) > 0.6, `x${pointOfSail(0.87).toFixed(2)}`);
}

console.log('\nbot pursuit');
{
  const w = new World({ weather: 'fair' });
  w.addShip(1, 'brig', 0, 200, 0);            // 200 m dead ahead of the bot
  w.addShip(2, 'brig', 0, 0, 0, true);
  const [target, bot] = w.ships;
  target.hull = 0.1;
  const chase = botCommand(bot, target, newBotMemory());
  check('a healthy bot runs down a crippled runner', Math.abs(chase.turn) < 0.1 && chase.sail === 1,
    `turn ${chase.turn.toFixed(2)}`);
  target.hull = 0.9;
  check('it does not give up the beam for a healthy target', Math.abs(botCommand(bot, target, newBotMemory()).turn) > 0.5);

  // Full duel: a loser that flees must still be caught, not left at 12% hull
  // for ten minutes (the old behaviour for this exact setup).
  const d = new World({ weather: 'fair' });
  d.addShip(1, 'brig', -70, -60, Math.PI * 0.2, true);
  d.addShip(2, 'brig', 70, 60, Math.PI * 0.8, true);
  let t = 0;
  while (t < TICK_HZ * 600 && !d.ships.some((s) => s.sinking > 0)) { d.step(); t++; }
  check('a bot-vs-bot duel is decided rather than stalling', d.ships.some((s) => s.sinking > 0),
    `${(t / TICK_HZ).toFixed(0)} s`);

  // Close on a crippled quarry: hold the beam rather than back off, so a
  // broadside can bear (frigates in fair weather used to orbit it for 600 s).
  target.hull = 0.1;
  bot.heading = 0;
  target.x = 80; target.z = 0;                 // 80 m abeam on the starboard side
  const close = botCommand(bot, target, newBotMemory());
  check('a bot on top of a quarry holds the beam, not opens range', Math.abs(close.turn) < 0.2,
    `turn ${close.turn.toFixed(2)}`);
  const f = new World({ weather: 'fair' });
  f.addShip(1, 'frigate', -70, -60, Math.PI * 0.2, true);
  f.addShip(2, 'frigate', 70, 60, Math.PI * 0.8, true);
  let ft = 0;
  while (ft < TICK_HZ * 300 && !f.ships.some((s) => s.sinking > 0)) { f.step(); ft++; }
  check('a fair-weather frigate duel is decided within 300 s', f.ships.some((s) => s.sinking > 0),
    `${(ft / TICK_HZ).toFixed(0)} s`);
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
  // Run a drop with followers abeam of the splash point (water contact, not a
  // direct hull hit) and report the world plus every event kind seen.
  // every event seen, and the dropper's hull.
  function dropWith(followers: { id: number; x: number; hull?: number }[]) {
    const w = new World({ weather: 'clear' });
    w.addShip(1, 'brig', 0, 0, 0);
    for (const f of followers) {
      w.addShip(f.id, 'brig', f.x, -11.5, 0);
      if (f.hull !== undefined) w.ships.find((s) => s.id === f.id)!.hull = f.hull;
    }
    const kinds: string[] = [];
    for (let t = 0; t < TICK_HZ * 6; t++) {
      w.applyCommand(1, hold({ fire: t === 0 ? 'stern' : null }));
      for (const f of followers) w.applyCommand(f.id, hold({ sail: 0 }));
      w.step();
      for (const e of w.snapshot().events) kinds.push(e.kind);
    }
    return { w, kinds };
  }

  const solo = dropWith([{ id: 2, x: 7 }]);
  check('the dropper is not hurt by its own blast', solo.w.ships[0].hull === 1, `hull ${solo.w.ships[0].hull}`);
  check('a blast is reported as a dropBlast event', solo.kinds.includes('dropBlast'));

  const pair = dropWith([{ id: 2, x: 7 }, { id: 3, x: -8 }]);
  check('every ship inside the radius is hit',
    pair.w.ships[1].hull < 1 && pair.w.ships[2].hull < 1,
    `hulls ${pair.w.ships[1].hull.toFixed(3)} ${pair.w.ships[2].hull.toFixed(3)}`);

  const kill = dropWith([{ id: 2, x: 7, hull: 0.02 }]);
  check('a blast can sink a crippled follower',
    kill.kinds.filter((k) => k === 'sunk').length === 1,
    `${kill.kinds.filter((k) => k === 'sunk').length} sunk events`);

  // The radius is a hard edge: just inside is hit, just outside is not.
  // Find where the charge lands, then park one ship either side of that point.
  const splash = (() => {
    const w = new World({ weather: 'clear' });
    w.addShip(1, 'brig', 0, 0, 0);
    for (let t = 0; t < TICK_HZ * 6; t++) {
      w.applyCommand(1, hold({ fire: t === 0 ? 'stern' : null }));
      w.step();
      for (const e of w.snapshot().events) if (e.kind === 'dropBlast') return { x: e.x, z: e.z };
    }
    return null;
  })();
  check('the lone-dropper charge lands and blasts', splash !== null);
  if (splash) {
    const w = new World({ weather: 'clear' });
    w.addShip(1, 'brig', 0, 0, 0);
    w.addShip(2, 'brig', splash.x + DROP_RADIUS - 1, splash.z, 0);
    w.addShip(3, 'brig', splash.x - DROP_RADIUS - 1, splash.z, 0);
    for (let t = 0; t < TICK_HZ * 6; t++) {
      w.applyCommand(1, hold({ fire: t === 0 ? 'stern' : null }));
      w.applyCommand(2, hold({ sail: 0 }));
      w.applyCommand(3, hold({ sail: 0 }));
      w.step();
    }
    check('a ship 1 m inside DROP_RADIUS is hit, one 1 m outside is not',
      w.ships[1].hull < 1 && w.ships[2].hull === 1,
      `hulls ${w.ships[1].hull.toFixed(3)} ${w.ships[2].hull.toFixed(3)}`);
  }
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

  // Hysteresis band is +-LOOK_HYSTERESIS_DEG: held just inside, released just outside.
  const pad = LOOK_HYSTERESIS_DEG;
  check('bow holds up to the hysteresis edge and releases just past it',
    armedMountFor(30 + pad, 'bow') === 'bow' && armedMountFor(30 + pad + 0.5, 'bow') === 'starboard');
  check('starboard holds just below its lower edge and releases past it',
    armedMountFor(30 - pad, 'starboard') === 'starboard' && armedMountFor(30 - pad - 0.5, 'starboard') === 'bow');

  // Continuous domain: inLookArc folds one revolution either side, so a
  // bearing and the same bearing +360 deg (yaw that has gone round once) agree.
  let mismatch = 0;
  for (let b = -180; b <= 180; b += 7.5) {
    const base = armedMountFor(b, null);
    if (armedMountFor(b + 360, null) !== base) mismatch++;
  }
  check('a bearing and the same bearing +360 deg pick the same sector', mismatch === 0, `${mismatch} mismatches`);
  check('stern covers both +180 and -180; port is -90, starboard +90',
    armedMountFor(180, null) === 'stern' && armedMountFor(-180, null) === 'stern' &&
    armedMountFor(-90, null) === 'port' && armedMountFor(90, null) === 'starboard');
  check('bow holds across the 0/360 seam in either direction',
    armedMountFor(-10, 'bow') === 'bow' && armedMountFor(350, 'bow') === 'bow' && armedMountFor(0, null) === 'bow');
  check('bearings beyond one revolution fold onto the same sector',
    armedMountFor(-450, null) === 'port' && armedMountFor(450, null) === 'starboard' &&
    armedMountFor(720, null) === 'bow' && armedMountFor(540, null) === 'stern' &&
    armedMountFor(-360 - 90, 'port') === 'port');
}

/* --- world rules around the edges ------------------------------------- */
console.log('\nworld rules');
{
  // Arena: a ship sailing at the wall is held inside it and slowed.
  const a = new World({ weather: 'clear', windFrom: 0 });
  a.addShip(1, 'sloop', 295, 0, Math.PI / 2);
  for (let t = 0; t < TICK_HZ * 20; t++) { a.applyCommand(1, hold({ sail: 1 })); a.step(); }
  check('a ship is held inside the arena', Math.abs(a.ships[0].x) <= ARENA_HALF + 1e-9,
    `x ${a.ships[0].x.toFixed(1)}`);

  // Class switch resets condition and reload instead of carrying damage over.
  const b = new World({ weather: 'clear' });
  b.addShip(1, 'galleon', 0, 0, 0);
  b.ships[0].hull = 0.2; b.ships[0].rig = 0.1; b.ships[0].reloadPort = 0.3;
  b.applyControl({ kind: 'setClass', shipId: 1, cls: 'sloop' });
  const sw = b.ships[0];
  check('switching class resets hull, rig and reload',
    sw.cls === 'sloop' && sw.hull === 1 && sw.rig === 1 && sw.reloadPort === 1 && sw.sinking === 0);

  // Respawn goes back to the fixed spawn point, at rest.
  const c = new World({ weather: 'clear' });
  c.addShip(1, 'sloop', 40, -25, 1.2);
  const ship = c.ships[0];
  ship.x = 200; ship.z = 100; ship.heading = 3; ship.speed = 4; ship.hull = 0;
  ship.sinking = 2;
  for (let t = 0; t < 2; t++) c.step();
  check('a sunk ship respawns at its spawn point, at rest',
    ship.x === 40 && ship.z === -25 && ship.heading === 1.2 && ship.speed === 0 && ship.sinking === 0,
    `at (${ship.x.toFixed(1)}, ${ship.z.toFixed(1)}) hdg ${ship.heading} spd ${ship.speed} sink ${ship.sinking}`);

  // A wreck going under cannot be hit again, so it cannot re-sink or emit events.
  const d = new World({ weather: 'clear' });
  d.addShip(1, 'sloop', 0, 0, 0);
  d.ships[0].sinking = 50;
  check('a sinking hull is not a target', !hitsShip(d.ships[0], 0, 0, 0));

  // A wreck drifting at the wall stays inside the arena until it respawns.
  const e = new World({ weather: 'clear' });
  e.addShip(1, 'sloop', 0, 0, 0);
  const w = e.ships[0];
  w.x = ARENA_HALF - 0.01; w.z = ARENA_HALF - 0.01; w.heading = Math.PI / 4; w.speed = 8; w.sinking = 40;
  let maxOut = 0;
  for (let t = 0; t < 30; t++) {
    e.step();
    maxOut = Math.max(maxOut, Math.abs(w.x) - ARENA_HALF, Math.abs(w.z) - ARENA_HALF);
  }
  check('a sinking ship stays inside the arena', maxOut <= 1e-9, `overshoot ${maxOut.toFixed(3)}`);
}

/* --- world command handling ---------------------------------------------- */
console.log('\nworld command handling');
{
  // Reload: a fired mount refills in exactly reloadSec and cannot fire sooner.
  const sloop = SHIP_CLASSES.sloop;
  const w = new World({ weather: 'clear' });
  w.addShip(1, 'sloop', 0, 0, 0);
  w.applyCommand(1, hold({ fire: 'port' })); w.step();
  const muzzles = () => w.snapshot().events.filter((e) => e.kind === 'muzzle').length;
  check('a ready mount fires and empties its reload', muzzles() === 1 && w.ships[0].reloadPort < 0.1);
  w.applyCommand(1, hold({ fire: 'port' })); w.step();
  check('a reloading mount does not fire', muzzles() === 0);
  check('the other broadside is untouched by the port shot', w.ships[0].reloadStbd === 1);
  let ticks = 2;
  while (w.ships[0].reloadPort < 1 && ticks < TICK_HZ * 60) { w.applyCommand(1, hold()); w.step(); ticks++; }
  const secs = ticks / TICK_HZ;
  check('port reload takes reloadSec', Math.abs(secs - sloop.combat.reloadSec) < 0.2,
    `${secs.toFixed(2)} s vs ${sloop.combat.reloadSec}`);

  // Acks: players advance ackSeq (never backwards); bots do not.
  const a = new World({ weather: 'clear' });
  a.addShip(1, 'sloop', 0, 0, 0);
  a.addShip(2, 'sloop', 100, 0, 0, true);
  a.applyCommand(1, hold({ seq: 7 })); a.step();
  check('ackSeq follows the player command', a.ackSeq === 7);
  a.applyCommand(1, hold({ seq: 3 })); a.step();
  check('ackSeq never moves backwards', a.ackSeq === 7);
  check('snapshot carries ackSeq', a.snapshot().ackSeq === 7);

  // Command values are clamped to legal ranges.
  const c = new World({ weather: 'clear' });
  c.addShip(1, 'sloop', 0, 0, 0);
  c.applyCommand(1, hold({ turn: 5, sail: 3 })); c.step();
  check('sail trim is clamped to 0..1', c.ships[0].sail === 1);
  const turned = Math.abs(c.ships[0].heading);
  const d = new World({ weather: 'clear' });
  d.addShip(1, 'sloop', 0, 0, 0);
  d.applyCommand(1, hold({ turn: 1, sail: 0 })); d.step();
  check('turn input beyond +-1 turns no faster than full rudder',
    Math.abs(turned - Math.abs(d.ships[0].heading)) < 1e-12);

  // A malformed command (NaN / Infinity) must not poison the ship's state.
  const bad = new World({ weather: 'clear' });
  bad.addShip(1, 'sloop', 0, 0, 0);
  bad.applyCommand(1, hold({ turn: NaN, sail: NaN })); bad.step();
  bad.applyCommand(1, hold({ turn: Infinity, sail: -Infinity })); bad.step();
  const bs = bad.ships[0];
  check('non-finite turn/sail keep heading, position and speed finite',
    [bs.heading, bs.x, bs.z, bs.speed, bs.sail].every(Number.isFinite),
    `heading ${bs.heading} x ${bs.x} sail ${bs.sail}`);

  // Non-finite aim values must not create NaN projectiles.
  const aim = new World({ weather: 'clear' });
  aim.addShip(1, 'sloop', 0, 0, 0);
  aim.applyCommand(1, hold({ fire: 'port', aimRange: NaN, aimHold: NaN })); aim.step();
  const shots = aim.projectiles;
  check('non-finite aimRange/aimHold still fire finite projectiles',
    shots.length > 0 && shots.every((p) => [p.x, p.y, p.z, p.vx, p.vy, p.vz].every(Number.isFinite)),
    `${shots.length} shots`);

  // An unknown ammo id from a malformed command must not crash the hit step.
  const badAmmo = new World({ weather: 'clear' }); badAmmo.addShip(1, 'sloop', 0, 0, 0); badAmmo.addShip(2, 'sloop', 40, 0, 0);
  badAmmo.applyCommand(1, hold({ fire: 'starboard', aimRange: 40, ammo: 'bogus' as never }));
  let threw = false;
  try { for (let i = 0; i < 300; i++) badAmmo.step(); } catch { threw = true; }
  check('unknown ammo id is treated as round shot and does not throw',
    !threw && badAmmo.projectiles.every((p) => p.ammo === 'round' || p.ammo === 'chain'));

  // An unknown mount from a malformed command must not fall through to the stern drop weapon.
  const badMount = new World({ weather: 'clear' }); badMount.addShip(1, 'sloop', 0, 0, 0);
  badMount.applyCommand(1, hold({ fire: 'bogus' as never }));
  for (let i = 0; i < 5; i++) badMount.step();
  const sternReady = badMount.snapshot().ships[0].reloadStern;
  check('unknown fire mount fires nothing and keeps stern loaded',
    badMount.projectiles.length === 0 && sternReady === 1, `${badMount.projectiles.length} projectiles`);

  // Weather control changes the weather and is reported in snapshots.
  c.applyControl({ kind: 'setWeather', weather: 'storm' });
  check('setWeather is reflected in the snapshot', c.snapshot().weather === 'storm');
}

/* --- points of sail ----------------------------------------------------- */
{
  console.log('\npoints of sail');
  const rad = (d: number) => (d * Math.PI) / 180;
  const at = (d: number) => pointOfSail(rad(d));
  check('in irons is the slowest point', at(0) < at(35) && at(0) <= at(180), `0deg ${at(0).toFixed(2)}`);
  let peak = 0, peakDeg = 0;
  for (let d = 0; d <= 180; d++) if (at(d) > peak) { peak = at(d); peakDeg = d; }
  check('a beam reach is the fastest point', peakDeg >= 85 && peakDeg <= 115 && Math.abs(peak - 1) < 1e-9, `peak ${peak.toFixed(2)} at ${peakDeg}deg`);
  let maxStep = 0;
  for (let d = 1; d <= 180; d++) maxStep = Math.max(maxStep, Math.abs(at(d) - at(d - 1)));
  check('the curve is continuous (no gearbox steps)', maxStep < 0.06, `max step per degree ${maxStep.toFixed(3)}`);
  check('running is slower than a broad reach', at(180) < at(130));
  check('angles beyond PI clamp and sign is ignored', pointOfSail(rad(270)) === at(180) && pointOfSail(-rad(90)) === at(90));
  check('zone names follow the design thresholds',
    pointOfSailName(rad(10)) === 'In Irons' && pointOfSailName(rad(60)) === 'Close Hauled' &&
    pointOfSailName(rad(90)) === 'Beam Reach' && pointOfSailName(rad(140)) === 'Broad Reach' &&
    pointOfSailName(rad(175)) === 'Running');
  check('angleOffWind wraps the short way round',
    Math.abs(angleOffWind(rad(350), rad(10)) - rad(20)) < 1e-9 && angleOffWind(0, 0) === 0 &&
    Math.abs(angleOffWind(0, Math.PI) - Math.PI) < 1e-9);
  check('normalizeAngle lands in (-PI, PI]', [-7, -Math.PI, 0, Math.PI, 3.5, 20].every((a) => {
    const n = normalizeAngle(a);
    return n > -Math.PI && n <= Math.PI;
  }));
}

console.log('\nwave field');
{
  const amp = 1.5;
  const spots: Array<[number, number]> = [];
  for (let i = -20; i <= 20; i++) for (let j = -20; j <= 20; j++) spots.push([i * 15.3, j * 14.7]);
  const bound = (0.62 + 0.44 + 0.24) * amp;
  check('height never exceeds the sum of wave amplitudes', spots.every(([x, z]) => Math.abs(waveHeight(x, z, amp)) <= bound + 1e-9), `bound ${bound.toFixed(2)}`);
  check('height is a pure function of position', spots.every(([x, z]) => waveHeight(x, z, amp) === waveHeight(x, z, amp)));
  check('height scales linearly with amplitude', spots.every(([x, z]) => Math.abs(waveHeight(x, z, 2 * amp) - 2 * waveHeight(x, z, amp)) < 1e-9));
  check('zero amplitude is a flat sea with an upright normal', spots.every(([x, z]) => {
    const n = waveNormal(x, z, 0);
    return waveHeight(x, z, 0) === 0 && n[0] === 0 && n[1] === 1 && n[2] === 0;
  }));
  check('normals are unit length and point upward', spots.every(([x, z]) => {
    const n = waveNormal(x, z, amp);
    return Math.abs(Math.hypot(n[0], n[1], n[2]) - 1) < 1e-9 && n[1] > 0;
  }));
  const peak = (x0: number) => {
    let m = 0;
    for (let i = 0; i < 400; i++) m = Math.max(m, Math.abs(waveHeight(x0 + i * 1.7, x0 + i * 0.9, amp)));
    return m;
  };
  const near = peak(0), far = peak(5000);
  check('the sea does not go calm far from the origin', far > 0.5 * near, `near ${near.toFixed(2)} far ${far.toFixed(2)}`);
  check('the normal leans downhill (towards falling height)', spots.every(([x, z]) => {
    const n = waveNormal(x, z, amp);
    const gx = waveHeight(x + 0.1, z, amp) - waveHeight(x - 0.1, z, amp);
    const gz = waveHeight(x, z + 0.1, amp) - waveHeight(x, z - 0.1, amp);
    return Math.abs(gx) < 1e-3 || n[0] * gx < 0 ? (Math.abs(gz) < 1e-3 || n[2] * gz < 0) : false;
  }));
}

/* --- weather scales ship speed ---------------------------------------- */
console.log('\nweather wind strength');
{
  function topSpeedIn(weather: WeatherId): number {
    const w = new World({ weather, windFrom: Math.PI });
    w.addShip(1, 'brig', 0, 0, 0); // running with the wind
    let peak = 0; // peak, not final: a fast ship reaches the arena wall, which halves speed
    for (let t = 0; t < TICK_HZ * 40; t++) {
      w.applyCommand(1, hold({ sail: 1 }));
      w.step();
      peak = Math.max(peak, w.ships[0].speed);
    }
    return peak;
  }
  const speeds = {} as Record<WeatherId, number>;
  for (const id of WEATHER_ORDER) speeds[id] = topSpeedIn(id);
  check('WEATHER_ORDER lists every preset exactly once',
    WEATHER_ORDER.length === Object.keys(WEATHER).length && new Set(WEATHER_ORDER).size === WEATHER_ORDER.length);
  check('every preset has a positive wind strength and matching id',
    WEATHER_ORDER.every((id) => WEATHER[id].windStrength > 0 && WEATHER[id].id === id));
  const ids = [...WEATHER_ORDER].sort((a, b) => WEATHER[a].windStrength - WEATHER[b].windStrength);
  let ordered = true;
  for (let i = 1; i < ids.length; i++) {
    if (WEATHER[ids[i]].windStrength > WEATHER[ids[i - 1]].windStrength && !(speeds[ids[i]] > speeds[ids[i - 1]])) ordered = false;
  }
  check('stronger wind means a faster top speed', ordered,
    ids.map((id) => `${id} ${speeds[id].toFixed(2)}`).join(', '));
  check('calm weather is slower than fair', speeds.clear < speeds.fair,
    `clear ${speeds.clear.toFixed(2)} vs fair ${speeds.fair.toFixed(2)} m/s`);
}

console.log('\nstepProjectile');
{
  const dt = 1 / TICK_HZ;
  const fly = (range: number) => {
    const th = elevationForRange(range);
    const p: Projectile = { id: 1, ownerId: 1, ammo: 'round', x: 0, y: 0, z: 0,
      vx: MUZZLE_SPEED * Math.cos(th), vy: MUZZLE_SPEED * Math.sin(th), vz: 0, age: 0 };
    while (p.y >= 0) stepProjectile(p, dt);
    return p;
  };
  const p = fly(120);
  check('a shot aimed at 120 m lands within a tick of travel of it', Math.abs(p.x - 120) < MUZZLE_SPEED * dt,
    `landed at ${p.x.toFixed(1)} m`);
  check('age counts one per step', p.age === Math.round(p.age) && p.age > 0, `${p.age} ticks`);
  check('longer aim range lands farther', fly(200).x > fly(120).x && fly(120).x > fly(60).x);
  check('range is clamped to MIN_RANGE and MAX_RANGE',
    elevationForRange(1) === elevationForRange(MIN_RANGE) && elevationForRange(9999) === elevationForRange(MAX_RANGE));
  const q: Projectile = { id: 2, ownerId: 1, ammo: 'round', x: 0, y: 5, z: 0, vx: 0, vy: 0, vz: 0, age: 0 };
  stepProjectile(q, 1);
  check('gravity pulls a stationary shot down at g', Math.abs(q.vy + GRAVITY) < 1e-9 && q.y < 5);
}

console.log('\napplyHit and fireVolley');
{
  const w = new World({ weather: 'clear' });
  w.addShip(1, 'brig', 0, 0, 0);
  const s = w.ships[0];
  const cls = SHIP_CLASSES[s.cls];
  const sank = applyHit(s, 'round');
  check('round shot damages hull by DAMAGE_PER_BALL / hullHp',
    !sank && Math.abs((1 - s.hull) - DAMAGE_PER_BALL / cls.combat.hullHp) < 1e-9);
  check('round shot hurts hull more than rig', 1 - s.hull > 1 - s.rig);
  const c = w.ships[0]; c.hull = 1; c.rig = 1;
  applyHit(c, 'chain');
  check('chain shot hurts rig more than hull', 1 - c.rig > 1 - c.hull);
  c.hull = 0.001; c.rig = 0.001;
  check('a lethal hit reports sunk and clamps at zero', applyHit(c, 'round') && c.hull === 0 && c.rig >= 0);

  let id = 0;
  const nextId = () => ++id;
  const f = new World({ weather: 'clear' });
  f.addShip(1, 'brig', 0, 0, 0);
  const sh = f.ships[0];
  const g = SHIP_CLASSES[sh.cls].combat;
  const star = fireVolley(sh, 'starboard', 120, 'round', 0, 1, nextId);
  const port = fireVolley(sh, 'port', 120, 'round', 0, 1, nextId);
  const bow = fireVolley(sh, 'bow', 120, 'round', 0, 1, nextId);
  check('broadside fires gunsPerSide balls, bow fires bowChasers', star.length === g.gunsPerSide && port.length === g.gunsPerSide && bow.length === g.bowChasers.guns);
  check('starboard shots go +x, port shots -x (heading north)', star.every(p => p.vx > 0) && port.every(p => p.vx < 0));
  check('bow chasers always load chain', bow.every(p => p.ammo === 'chain') && star.every(p => p.ammo === 'round'));
  check('shots carry the shooter id and unique ids', star.every(p => p.ownerId === 1) && new Set([...star, ...port, ...bow].map(p => p.id)).size === star.length + port.length + bow.length);
  const again = fireVolley(sh, 'starboard', 120, 'round', 0, 1, () => 0);
  check('same tick gives the same spread (deterministic)', again.every((p, i) => p.vx === star[i].vx && p.vz === star[i].vz));
  const spread = (hold: number) => { const v = fireVolley(sh, 'starboard', 120, 'round', hold, 1, nextId).map(p => Math.atan2(p.vz, p.vx)); return Math.max(...v) - Math.min(...v); };
  check('holding aim narrows the pattern', spread(1) < spread(0));
}

console.log('\ntimeOfFlight and elevation edges');
{
  for (const range of [60, 120, 250]) {
    const p: Projectile = { id: 1, ownerId: 1, ammo: 'round', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0 };
    const th = elevationForRange(range);
    p.vz = MUZZLE_SPEED * Math.cos(th);
    p.vy = MUZZLE_SPEED * Math.sin(th);
    const dt = 1 / TICK_HZ;
    while (p.y >= 0 && p.age < 10000) stepProjectile(p, dt);
    check(`timeOfFlight(${range}) matches the integrated flight`, Math.abs(p.age * dt - timeOfFlight(range)) < 2 * dt,
      `${(p.age * dt).toFixed(3)}s vs ${timeOfFlight(range).toFixed(3)}s`);
  }
  check('range below minimum is raised to MIN_RANGE', elevationForRange(1) === elevationForRange(MIN_RANGE));
  check('elevation rises with range and stays under 45 deg', elevationForRange(250) > elevationForRange(60) && elevationForRange(250) < Math.PI / 4);
  check('time of flight is capped at MAX_RANGE flight time', timeOfFlight(9999) === timeOfFlight(MAX_RANGE));
}

console.log('\nfireDropWeapon');
{
  const w = new World({ weather: 'clear' });
  w.addShip(1, 'brig', 0, 0, 0);
  const s = w.ships[0];
  s.speed = 5;
  const cls = SHIP_CLASSES[s.cls];
  const d = fireDropWeapon(s, 7, () => 42);
  check('drop charge uses the given id, shooter id and drop ammo', d.id === 42 && d.ownerId === 1 && d.ammo === 'drop');
  check('drop charge starts with no vertical speed', d.vy === 0);
  check('drop charge carries 0.6x ship motion (heading north)', Math.abs(d.vz - 3) < 1e-9 && Math.abs(d.vx) < 1e-9);
  check('drop charge starts astern of the ship', d.z < s.z && Math.abs(d.z + cls.geo.len * 0.55) < 1e-6);
  const again = fireDropWeapon(s, 7, () => 0);
  check('same tick gives the same drop position (deterministic)', again.x === d.x && again.z === d.z);
}

console.log('');
if (failures > 0) {
  console.error(`${failures} combat check(s) failed`);
  process.exit(1);
}
console.log('all combat checks passed');
