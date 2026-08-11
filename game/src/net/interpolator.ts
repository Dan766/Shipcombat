/* Snapshot interpolation.
 *
 * The client renders the past: it holds incoming snapshots in a buffer and
 * draws at (latest server time - delay), so there are always two snapshots to
 * blend between and no stutter when one arrives late.
 *
 * This is the client-side half of the seam. When prediction is added later it
 * goes here, on top of this, not instead of it.
 *
 * MUST NOT import Babylon.
 */

import type { ShipState, Snapshot } from '../sim/types.ts';
import { normalizeAngle } from '../sim/wind.ts';

export class Interpolator {
  /** How far behind the newest snapshot to render, in ms. */
  delayMs: number;

  private buffer: Snapshot[] = [];
  private maxBuffer = 40;

  constructor(delayMs = 120) { this.delayMs = delayMs; }

  push(snap: Snapshot): void {
    this.buffer.push(snap);
    this.buffer.sort((a, b) => a.time - b.time);
    while (this.buffer.length > this.maxBuffer) this.buffer.shift();
  }

  get latest(): Snapshot | null {
    return this.buffer.length ? this.buffer[this.buffer.length - 1] : null;
  }

  /**
   * World state to draw right now. Returns null until at least one snapshot
   * has arrived.
   */
  sample(): Snapshot | null {
    if (this.buffer.length === 0) return null;
    if (this.buffer.length === 1) return this.buffer[0];

    const newest = this.buffer[this.buffer.length - 1];
    const renderTime = newest.time - this.delayMs;

    // Older than anything buffered: hold the oldest rather than extrapolate.
    if (renderTime <= this.buffer[0].time) return this.buffer[0];

    let a = this.buffer[0];
    let b = newest;
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].time <= renderTime && this.buffer[i + 1].time >= renderTime) {
        a = this.buffer[i];
        b = this.buffer[i + 1];
        break;
      }
    }

    const span = b.time - a.time;
    const t = span > 0 ? (renderTime - a.time) / span : 0;

    const ships: ShipState[] = a.ships.map((sa) => {
      const sb = b.ships.find((s) => s.id === sa.id) ?? sa;
      return {
        id: sa.id,
        cls: sb.cls,
        x: sa.x + (sb.x - sa.x) * t,
        z: sa.z + (sb.z - sa.z) * t,
        // Interpolate the shortest way round so crossing north does not spin.
        heading: sa.heading + normalizeAngle(sb.heading - sa.heading) * t,
        speed: sa.speed + (sb.speed - sa.speed) * t,
        sail: sa.sail + (sb.sail - sa.sail) * t,
        hull: sa.hull + (sb.hull - sa.hull) * t,
        rig: sa.rig + (sb.rig - sa.rig) * t,
        reloadPort: sa.reloadPort + (sb.reloadPort - sa.reloadPort) * t,
        reloadStbd: sa.reloadStbd + (sb.reloadStbd - sa.reloadStbd) * t,
        // Discrete: a ship is sinking or it is not, so take the newer truth.
        sinking: sb.sinking,
      };
    });

    /* Projectiles come from the newer snapshot as-is rather than being
     * blended: they are created and destroyed constantly, so pairing them up
     * between snapshots would match unrelated balls to each other. They move
     * fast enough that a tick of staleness is invisible. */
    return { ...b, ships };
  }
}
