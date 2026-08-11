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
}

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
  sail: number;
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
  /** Highest command sequence the server has consumed, per ship. */
  ackSeq: number;
}
