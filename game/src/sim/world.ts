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
import { stepProjectile, type Projectile } from './ballistics.ts';
import { botCommand, newBotMemory, type BotMemory } from './bot.ts';
import { fireVolley, fireDropWeapon, hitsShip, applyHit, rigEfficiency, DROP_RADIUS } from './combat.ts';
import type { CombatEvent, Command, ControlMessage, ShipState, Snapshot } from './types.ts';
import { TICK_HZ } from './types.ts';
import { waveHeight } from './waves.ts';
import { angleOffWind, normalizeAngle, pointOfSail } from './wind.ts';

const DT = 1 / TICK_HZ;

/** How much a ship's turn rate falls off as it approaches top speed. */
const TURN_SPEED_FALLOFF = 0.45;

/** Arena half-extent in metres. Ships are held inside it. */
export const ARENA_HALF = 300;

/** Ticks a hull stays visible while it goes under, before respawning. */
const SINK_TICKS = TICK_HZ * 5;

/** Projectiles are retired after this long even if they never land. */
const MAX_PROJECTILE_AGE = TICK_HZ * 12;

/** Metres between swept-collision samples along a projectile's step. */
const SWEEP_STEP = 0.8;

interface ShipRuntime extends ShipState {
  bot?: BotMemory;
  /** Where this ship respawns. Fixed per ship so respawns are deterministic. */
  spawn: { x: number; z: number; heading: number };
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
  projectiles: Projectile[] = [];
  ackSeq = 0;

  private pending = new Map<number, Command>();
  private events: CombatEvent[] = [];
  private nextProjectileId = 1;

  constructor(opts: WorldOptions = {}) {
    this.weather = opts.weather ?? 'fair';
    this.windFrom = opts.windFrom ?? Math.PI * 0.25;
  }

  addShip(id: number, cls: ShipClassId, x: number, z: number, heading: number, isBot = false): void {
    this.ships.push({
      id, cls, x, z, heading,
      speed: 0, sail: 1,
      hull: 1, rig: 1,
      reloadPort: 1, reloadStbd: 1, reloadBow: 1, reloadStern: 1,
      sinking: 0,
      bot: isBot ? newBotMemory() : undefined,
      spawn: { x, z, heading },
    });
  }

  /**
   * Queue a command for the next tick.
   *
   * Continuous intent (rudder, trim, aim) takes the newest value, but a fire
   * order is edge-triggered and must survive: whenever the client's command
   * rate outruns the tick rate — which is any time the framerate is below
   * 30 fps — several commands land between two ticks, and naively keeping the
   * last one silently swallows the shot. This is the difference between "I
   * pressed fire and nothing happened" being a rare mystery and being the
   * normal experience on a slow machine.
   */
  applyCommand(shipId: number, cmd: Command): void {
    const prev = this.pending.get(shipId);
    if (prev && prev.fire != null && cmd.fire == null) {
      this.pending.set(shipId, { ...cmd, fire: prev.fire });
    } else {
      this.pending.set(shipId, cmd);
    }
  }

  applyControl(msg: ControlMessage): void {
    if (msg.kind === 'setWeather') {
      this.weather = msg.weather;
    } else if (msg.kind === 'setClass') {
      const ship = this.ships.find((s) => s.id === msg.shipId);
      if (ship) {
        ship.cls = msg.cls;
        ship.speed = Math.min(ship.speed, SHIP_CLASSES[msg.cls].sail.baseSpeed);
        // A different ship is a different ship: reset its condition rather
        // than carrying a galleon's damage onto a sloop.
        ship.hull = 1; ship.rig = 1;
        ship.reloadPort = 1; ship.reloadStbd = 1; ship.reloadBow = 1; ship.reloadStern = 1;
        ship.sinking = 0;
      }
    }
  }

  /** Advance exactly one fixed timestep. */
  step(): void {
    this.events = [];
    const windStrength = WEATHER[this.weather].windStrength;
    const amp = WEATHER[this.weather].ocean.amp;

    for (const ship of this.ships) {
      const def = SHIP_CLASSES[ship.cls];

      if (ship.sinking > 0) {
        ship.sinking--;
        ship.speed *= 0.94;
        ship.x += Math.sin(ship.heading) * ship.speed * DT;
        ship.z += Math.cos(ship.heading) * ship.speed * DT;
        ship.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, ship.x));
        ship.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, ship.z));
        if (ship.sinking === 0) this.respawn(ship);
        continue;
      }

      // Bots produce commands through the same channel a player would.
      let cmd = this.pending.get(ship.id);
      if (ship.bot) {
        const target = this.ships.find((s) => s.id !== ship.id && s.sinking === 0);
        cmd = botCommand(ship, target, ship.bot, this.windFrom);
      }

      let turn = 0;
      if (cmd) {
        // Math.min/max pass NaN through, and one NaN heading poisons the ship's
        // position for good, so a malformed command reads as "no input".
        turn = Number.isFinite(cmd.turn) ? Math.max(-1, Math.min(1, cmd.turn)) : 0;
        if (Number.isFinite(cmd.sail)) ship.sail = Math.max(0, Math.min(1, cmd.sail));
        if (!ship.bot) this.ackSeq = Math.max(this.ackSeq, cmd.seq);
      }

      // Rigging damage costs speed and handling — this is what chain shot buys.
      const eff = rigEfficiency(ship.rig);

      const speedFrac = def.sail.baseSpeed > 0 ? ship.speed / def.sail.baseSpeed : 0;
      const turnRate = ((def.sail.turnRate * Math.PI) / 180)
        * (1 - TURN_SPEED_FALLOFF * speedFrac) * eff;
      ship.heading = normalizeAngle(ship.heading + turn * turnRate * DT);

      const off = angleOffWind(ship.heading, this.windFrom);
      const target = def.sail.baseSpeed * pointOfSail(off) * windStrength * ship.sail * eff;

      const delta = target - ship.speed;
      const rate = def.sail.accel * (delta > 0 ? 1 : 1.6);
      ship.speed += Math.max(-Math.abs(delta), Math.min(Math.abs(delta), rate * DT * Math.sign(delta)));

      ship.x += Math.sin(ship.heading) * ship.speed * DT;
      ship.z += Math.cos(ship.heading) * ship.speed * DT;

      // Reload every mount regardless of which one fired.
      const perTick = DT / def.combat.reloadSec;
      ship.reloadPort = Math.min(1, ship.reloadPort + perTick);
      ship.reloadStbd = Math.min(1, ship.reloadStbd + perTick);
      ship.reloadBow = Math.min(1, ship.reloadBow + DT / def.combat.bowChasers.reloadSec);
      ship.reloadStern = Math.min(1, ship.reloadStern + DT / def.combat.dropWeapon.reloadSec);

      if (cmd && cmd.fire) {
        const mount = cmd.fire;
        const ready = mount === 'port' ? ship.reloadPort
          : mount === 'starboard' ? ship.reloadStbd
            : mount === 'bow' ? ship.reloadBow
              : ship.reloadStern;

        if (ready >= 1) {
          if (mount === 'stern') {
            this.projectiles.push(fireDropWeapon(ship, this.tick, () => this.nextProjectileId++));
            ship.reloadStern = 0;
          } else {
            const volley = fireVolley(ship, mount, cmd.aimRange, cmd.ammo, cmd.aimHold, this.tick,
              () => this.nextProjectileId++);
            this.projectiles.push(...volley);
            if (mount === 'port') ship.reloadPort = 0;
            else if (mount === 'starboard') ship.reloadStbd = 0;
            else ship.reloadBow = 0;
          }
          this.events.push({ kind: 'muzzle', shipId: ship.id, mount });
        }
      }

      if (Math.abs(ship.x) > ARENA_HALF) {
        ship.x = Math.sign(ship.x) * ARENA_HALF;
        ship.speed *= 0.5;
      }
      if (Math.abs(ship.z) > ARENA_HALF) {
        ship.z = Math.sign(ship.z) * ARENA_HALF;
        ship.speed *= 0.5;
      }
    }

    this.stepProjectiles(amp);

    this.pending.clear();
    this.tick++;
  }

  private stepProjectiles(amp: number): void {
    const alive: Projectile[] = [];

    for (const p of this.projectiles) {
      const px = p.x, py = p.y, pz = p.z;
      stepProjectile(p, DT);

      /* Swept collision. A ball covers ~2.2 m per tick while a sloop is only
       * 4.1 m in the beam, so testing just the end of the step lets shots
       * tunnel clean through a thin hull. Sample along the segment instead. */
      const dist = Math.hypot(p.x - px, p.y - py, p.z - pz);
      const samples = Math.max(1, Math.min(8, Math.ceil(dist / SWEEP_STEP)));

      let consumed = false;
      for (let i = 1; i <= samples && !consumed; i++) {
        const t = i / samples;
        const sx = px + (p.x - px) * t;
        const sy = py + (p.y - py) * t;
        const sz = pz + (p.z - pz) * t;

        for (const ship of this.ships) {
          if (ship.id === p.ownerId) continue;
          if (!hitsShip(ship, sx, sy, sz)) continue;
          const sank = applyHit(ship, p.ammo);
          this.events.push({ kind: 'impact', x: sx, y: sy, z: sz, shipId: ship.id });
          if (sank && ship.sinking === 0) {
            ship.sinking = SINK_TICKS;
            this.events.push({ kind: 'sunk', shipId: ship.id });
          }
          consumed = true;
          break;
        }

        if (!consumed && sy <= waveHeight(sx, sz, amp)) {
          if (p.ammo === 'drop') {
            // A fire barrel's blast reaches a radius rather than a point —
            // it punishes a ship following too close, not a direct hit.
            for (const ship of this.ships) {
              if (ship.id === p.ownerId || ship.sinking > 0) continue;
              if (Math.hypot(ship.x - sx, ship.z - sz) > DROP_RADIUS) continue;
              const sank = applyHit(ship, 'drop');
              if (sank && ship.sinking === 0) {
                ship.sinking = SINK_TICKS;
                this.events.push({ kind: 'sunk', shipId: ship.id });
              }
            }
            this.events.push({ kind: 'dropBlast', x: sx, z: sz });
          } else {
            this.events.push({ kind: 'splash', x: sx, z: sz });
          }
          consumed = true;
        }
      }

      if (!consumed && p.age < MAX_PROJECTILE_AGE) alive.push(p);
    }

    this.projectiles = alive;
  }

  private respawn(ship: ShipRuntime): void {
    ship.x = ship.spawn.x;
    ship.z = ship.spawn.z;
    ship.heading = ship.spawn.heading;
    ship.speed = 0;
    ship.hull = 1;
    ship.rig = 1;
    ship.reloadPort = 1;
    ship.reloadStbd = 1;
    ship.reloadBow = 1;
    ship.reloadStern = 1;
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
        hull: s.hull, rig: s.rig,
        reloadPort: s.reloadPort, reloadStbd: s.reloadStbd,
        reloadBow: s.reloadBow, reloadStern: s.reloadStern,
        sinking: s.sinking,
      })),
      projectiles: this.projectiles.map((p) => ({
        id: p.id, ownerId: p.ownerId, ammo: p.ammo, x: p.x, y: p.y, z: p.z,
      })),
      events: this.events,
    };
  }

  /** Order-independent digest of world state, for the determinism check. */
  hash(): string {
    const round = (n: number) => Math.round(n * 1e6) / 1e6;
    const parts: Array<string | number> = [this.tick, this.weather, round(this.windFrom)];
    for (const s of [...this.ships].sort((a, b) => a.id - b.id)) {
      parts.push(s.id, s.cls, round(s.x), round(s.z), round(s.heading), round(s.speed),
        round(s.sail), round(s.hull), round(s.rig), round(s.reloadPort), round(s.reloadStbd),
        round(s.reloadBow), round(s.reloadStern), s.sinking);
    }
    // Projectiles are exactly the sort of state that drifts, so they are in
    // the digest too.
    for (const p of [...this.projectiles].sort((a, b) => a.id - b.id)) {
      parts.push(p.id, p.ownerId, p.ammo, round(p.x), round(p.y), round(p.z));
    }
    return parts.join('|');
  }
}
