/* The authoritative simulation.
 *
 * Pure and deterministic: state advances only via `step()` on a fixed
 * timestep, driven only by commands. No wall-clock reads, no Math.random, no
 * engine imports. That is what lets this same code run on a server later
 * without being rewritten.
 *
 * MUST NOT import Babylon — enforced by `npm run check:layering`.
 */

import { SHIP_CLASSES, type ShipClassId } from '../data/shipClasses.ts';
import { WEATHER, type WeatherId } from '../data/weather.ts';
import type { Command, ControlMessage, ShipState, Snapshot } from './types.ts';
import { TICK_HZ } from './types.ts';
import { angleOffWind, normalizeAngle, pointOfSail } from './wind.ts';

const DT = 1 / TICK_HZ;

/** How much a ship's turn rate falls off as it approaches top speed. */
const TURN_SPEED_FALLOFF = 0.45;

/** Arena half-extent in metres. Ships are held inside it. */
export const ARENA_HALF = 300;

interface ShipRuntime extends ShipState {
  /** Scripted heading the AI ship steers toward; undefined for players. */
  scripted?: boolean;
}

export interface WorldOptions {
  weather?: WeatherId;
  windFrom?: number;
}

export class World {
  tick = 0;
  weather: WeatherId;
  windFrom: number;
  ships: ShipRuntime[] = [];
  ackSeq = 0;

  private pending = new Map<number, Command>();

  constructor(opts: WorldOptions = {}) {
    this.weather = opts.weather ?? 'fair';
    this.windFrom = opts.windFrom ?? Math.PI * 0.25;
  }

  addShip(id: number, cls: ShipClassId, x: number, z: number, heading: number, scripted = false): void {
    this.ships.push({ id, cls, x, z, heading, speed: 0, sail: 1, scripted });
  }

  /** Queue a command. Only the latest per ship survives to the next tick. */
  applyCommand(shipId: number, cmd: Command): void {
    this.pending.set(shipId, cmd);
  }

  applyControl(msg: ControlMessage): void {
    if (msg.kind === 'setWeather') {
      this.weather = msg.weather;
    } else if (msg.kind === 'setClass') {
      const ship = this.ships.find((s) => s.id === msg.shipId);
      if (ship) {
        ship.cls = msg.cls;
        ship.speed = Math.min(ship.speed, SHIP_CLASSES[msg.cls].sail.baseSpeed);
      }
    }
  }

  /** Advance exactly one fixed timestep. */
  step(): void {
    const windStrength = WEATHER[this.weather].windStrength;

    for (const ship of this.ships) {
      const def = SHIP_CLASSES[ship.cls];

      let turn = 0;
      if (ship.scripted) {
        // A slow, steady turn — enough to prove the snapshot path carries
        // more than one entity and that interpolation handles motion.
        turn = 0.35;
        ship.sail = 1;
      } else {
        const cmd = this.pending.get(ship.id);
        if (cmd) {
          turn = Math.max(-1, Math.min(1, cmd.turn));
          ship.sail = Math.max(0, Math.min(1, cmd.sail));
          this.ackSeq = Math.max(this.ackSeq, cmd.seq);
        }
      }

      // Turn rate falls off with speed, so ships cannot pivot at full pace.
      const speedFrac = def.sail.baseSpeed > 0 ? ship.speed / def.sail.baseSpeed : 0;
      const turnRate = (def.sail.turnRate * Math.PI) / 180 * (1 - TURN_SPEED_FALLOFF * speedFrac);
      ship.heading = normalizeAngle(ship.heading + turn * turnRate * DT);

      const off = angleOffWind(ship.heading, this.windFrom);
      const target = def.sail.baseSpeed * pointOfSail(off) * windStrength * ship.sail;

      // Chase the target rather than snapping to it: the lag is most of what
      // makes a heavy ship feel heavy.
      const delta = target - ship.speed;
      const rate = def.sail.accel * (delta > 0 ? 1 : 1.6); // slows faster than it builds
      ship.speed += Math.max(-Math.abs(delta), Math.min(Math.abs(delta), rate * DT * Math.sign(delta)));

      ship.x += Math.sin(ship.heading) * ship.speed * DT;
      ship.z += Math.cos(ship.heading) * ship.speed * DT;

      // Soft arena bounds — clamp and bleed speed rather than hard-stopping.
      if (Math.abs(ship.x) > ARENA_HALF) {
        ship.x = Math.sign(ship.x) * ARENA_HALF;
        ship.speed *= 0.5;
      }
      if (Math.abs(ship.z) > ARENA_HALF) {
        ship.z = Math.sign(ship.z) * ARENA_HALF;
        ship.speed *= 0.5;
      }
    }

    this.pending.clear();
    this.tick++;
  }

  snapshot(): Snapshot {
    return {
      tick: this.tick,
      time: this.tick * (1000 / TICK_HZ),
      weather: this.weather,
      windFrom: this.windFrom,
      ackSeq: this.ackSeq,
      ships: this.ships.map((s) => ({
        id: s.id, cls: s.cls, x: s.x, z: s.z,
        heading: s.heading, speed: s.speed, sail: s.sail,
      })),
    };
  }

  /** Order-independent digest of world state, for the determinism check. */
  hash(): string {
    const round = (n: number) => Math.round(n * 1e6) / 1e6;
    const parts: Array<string | number> = [this.tick, this.weather, round(this.windFrom)];
    for (const s of [...this.ships].sort((a, b) => a.id - b.id)) {
      parts.push(s.id, s.cls, round(s.x), round(s.z), round(s.heading), round(s.speed), round(s.sail));
    }
    return parts.join('|');
  }
}
