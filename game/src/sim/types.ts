/* Wire types.
 *
 * These are the only things that cross the client/server boundary, so they
 * are deliberately plain and serialisable — no class instances, no functions,
 * nothing that survives JSON only by accident.
 *
 * MUST NOT import Babylon.
 */

import type { ShipClassId } from '../data/shipClasses.ts';
import type { WeatherId } from '../data/weather.ts';

export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;

/** One tick of player intent. Sent client -> server. */
export interface Command {
  seq: number;
  /** Rudder: -1 hard to port, +1 hard to starboard. */
  turn: number;
  /** Sail trim, 0 (furled) to 1 (full). */
  sail: number;
  /** Fire a broadside: -1 port, +1 starboard, 0 hold. */
  fire: -1 | 0 | 1;
  /** Where the volley should land, in metres off the beam. */
  aimRange: number;
  ammo: AmmoId;
}

export type AmmoId = 'round' | 'chain';

/** Things that happened on a tick, for the renderer to react to. Transient:
 *  they appear in exactly one snapshot and are never state. */
export type CombatEvent =
  | { kind: 'muzzle'; shipId: number; side: -1 | 1 }
  | { kind: 'splash'; x: number; z: number }
  | { kind: 'impact'; x: number; y: number; z: number; shipId: number }
  | { kind: 'sunk'; shipId: number };

/** Out-of-band requests. Debug affordances for the slice, not gameplay. */
export type ControlMessage =
  | { kind: 'setClass'; shipId: number; cls: ShipClassId }
  | { kind: 'setWeather'; weather: WeatherId };

export interface ShipState {
  id: number;
  cls: ShipClassId;
  x: number;
  z: number;
  /** Radians; 0 points along +Z, increasing toward +X. */
  heading: number;
  speed: number;
  /** Sail trim the helm has set, 0..1. */
  sail: number;
  /** Hull integrity, 0..1. Zero means sinking. */
  hull: number;
  /** Rigging condition, 0..1. Scales speed and turn rate. */
  rig: number;
  /** Reload progress per side, 0 (just fired) .. 1 (ready). */
  reloadPort: number;
  reloadStbd: number;
  /** Ticks remaining in the sinking animation; 0 when afloat. */
  sinking: number;
}

export interface ProjectileState {
  id: number;
  ownerId: number;
  ammo: AmmoId;
  x: number;
  y: number;
  z: number;
}

/** Authoritative world state at one tick. Sent server -> client. */
export interface Snapshot {
  tick: number;
  /** Server time in ms for this tick — the clock the client interpolates on. */
  time: number;
  weather: WeatherId;
  /** Direction the wind blows FROM, in radians. */
  windFrom: number;
  ships: ShipState[];
  /* Projectiles are in the snapshot because hits are decided by the server.
   * Two galleons trading volleys is ~40 in flight — fine in-process, and the
   * first thing worth compressing once there is a real wire. */
  projectiles: ProjectileState[];
  /** Events that happened this tick: muzzle flashes, splashes, impacts. */
  events: CombatEvent[];
  /** Highest command sequence the server has consumed, per ship. */
  ackSeq: number;
}
