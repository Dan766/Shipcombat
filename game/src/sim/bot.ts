/* Enemy AI.
 *
 * Emits Commands through exactly the same path a player does — it has no
 * privileged access to the world, which keeps it honest and means anything it
 * can do, a player could. Fully deterministic: no Math.random, no clock reads.
 *
 * The behaviour is deliberately simple but not passive: close to a preferred
 * range, then turn to keep the enemy on the beam, because that is where the
 * guns point. That alone produces recognisable circling duels.
 *
 * MUST NOT import Babylon.
 */

import { MAX_RANGE, MIN_RANGE } from './ballistics.ts';
import { TICK_HZ, type Command, type ShipState } from './types.ts';
import { normalizeAngle } from './wind.ts';

/** Range the bot tries to hold, in metres. Inside its guns, outside a ram. */
const PREFERRED_RANGE = 130;
/** How far off the beam a target may be before the bot will fire. */
const FIRE_ARC = 0.42; // ~24 degrees
/** How far off the bow a target may be before the bow chasers will fire. */
const BOW_ARC = 0.17; // ~10 degrees
/** How far off dead astern a follower may be before the drop weapon is used. */
const STERN_ARC = 0.52; // ~30 degrees
/** Follower distance, in metres, close enough for the charge to catch it. */
const STERN_RANGE = 18;
/** Ticks of steady aim to reach full spread reduction, matching the player's ~1 s hold. */
const AIM_RAMP_TICKS = TICK_HZ;
/** Own hull fraction below which the bot breaks off, if it is losing the duel. */
const FLEE_HULL = 0.3;

export interface BotMemory {
  seq: number;
  /** Which way it circles. Flipped only when it needs to disengage. */
  circleDir: 1 | -1;
  /** 0..1, how long a broadside has been steadily laid on the target. */
  aimHold: number;
}

export function newBotMemory(): BotMemory {
  return { seq: 0, circleDir: 1, aimHold: 0 };
}

export function botCommand(self: ShipState, target: ShipState | undefined, mem: BotMemory): Command {
  const idle: Command = {
    seq: mem.seq++, turn: 0, sail: 1, fire: null, aimRange: PREFERRED_RANGE, ammo: 'round', aimHold: 0,
  };
  if (!target || target.sinking > 0 || self.sinking > 0) return idle;

  const dx = target.x - self.x;
  const dz = target.z - self.z;
  const range = Math.hypot(dx, dz);
  const bearing = Math.atan2(dx, dz);
  const relative = normalizeAngle(bearing - self.heading);

  // Steer toward a heading that puts the target on the beam at the range we
  // want. Too far: cut the angle inward. Too close: open it out.
  const closing = range > PREFERRED_RANGE * 1.15 ? -0.55
    : range < PREFERRED_RANGE * 0.7 ? 0.55
      : 0;
  const wantOffset = (Math.PI / 2 + closing) * mem.circleDir;
  // A badly hurt bot that is also worse off than its target runs for open
  // water instead of circling to the death; guns still fire if one bears.
  const fleeing = self.hull < FLEE_HULL && self.hull < target.hull;
  const desired = fleeing ? normalizeAngle(bearing + Math.PI) : normalizeAngle(bearing - wantOffset);
  const error = normalizeAngle(desired - self.heading);

  const turn = Math.max(-1, Math.min(1, error * 2.2));

  // Fire when the target sits near the beam on either side and is in range.
  const offBeam = Math.abs(Math.abs(relative) - Math.PI / 2);
  const inArc = offBeam < FIRE_ARC;
  const side: -1 | 1 = relative < 0 ? -1 : 1;
  const ready = side < 0 ? self.reloadPort >= 1 : self.reloadStbd >= 1;
  const inRange = range > MIN_RANGE && range < MAX_RANGE * 0.85;

  // Chain shot at a healthy runner, round shot at anything already hurt or
  // close enough to finish.
  const useChain = target.rig > 0.55 && range > PREFERRED_RANGE;

  // Bow chasers are the only gun that bears dead ahead, and always load chain.
  // A broadside is the better weapon, so they only fire when none can.
  const bowReady = self.reloadBow >= 1 && Math.abs(relative) < BOW_ARC && inRange;
  const broadside = inArc && ready && inRange;

  // The stern charge only helps against a ship tailing close behind, so it is
  // kept for exactly that; a broadside still takes priority if one bears.
  const sternReady = self.reloadStern >= 1 && range < STERN_RANGE
    && Math.PI - Math.abs(relative) < STERN_ARC;

  // Like a player holding aim: steady while a broadside bears, kept through
  // the reload, lost the moment the target slides off the beam or a gun fires.
  mem.aimHold = inArc && inRange ? Math.min(1, mem.aimHold + 1 / AIM_RAMP_TICKS) : 0;
  const aimHold = mem.aimHold;
  if (broadside) mem.aimHold = 0;

  return {
    seq: mem.seq++,
    turn,
    sail: 1,
    fire: broadside ? (side < 0 ? 'port' : 'starboard')
      : sternReady ? 'stern' : bowReady ? 'bow' : null,
    aimRange: Math.max(MIN_RANGE, Math.min(range, MAX_RANGE)),
    ammo: useChain ? 'chain' : 'round',
    aimHold,
  };
}

/** Bearing helper the HUD also wants, kept here next to the AI that uses it. */
export function bearingTo(from: ShipState, to: ShipState): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/** Which broadside, if any, a target is currently under. */
export function firingSide(self: ShipState, to: ShipState): -1 | 1 | 0 {
  const relative = normalizeAngle(bearingTo(self, to) - self.heading);
  const offBeam = Math.abs(Math.abs(relative) - Math.PI / 2);
  if (offBeam > FIRE_ARC) return 0;
  return relative < 0 ? -1 : 1;
}

export { PREFERRED_RANGE, FIRE_ARC, FLEE_HULL };
