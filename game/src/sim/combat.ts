/* Gunnery: firing volleys, hitting things, and what damage does.
 *
 * Deterministic throughout — spread comes from a seeded generator keyed on the
 * shot, never Math.random, so a replayed command log produces an identical
 * fight. MUST NOT import Babylon.
 */

import { SHIP_CLASSES } from '../data/shipClasses.ts';
import { elevationForRange, MUZZLE_SPEED, type Projectile } from './ballistics.ts';
import type { AmmoId, ProjectileAmmo, ShipState } from './types.ts';

/** Damage one ball carries. Everything else scales off this. */
export const DAMAGE_PER_BALL = 3.0;

/** How each ammo splits its damage between the two tracks. */
export const AMMO: Record<ProjectileAmmo, { hull: number; rig: number; label: string }> = {
  // Solid shot: all of it into the hull. The way you actually sink something.
  round: { hull: 1.0, rig: 0.15, label: 'Round Shot' },
  // Chain: tears rigging apart, barely scratches timber. The way you catch
  // something faster than you — the only reason to ever load it.
  chain: { hull: 0.25, rig: 1.0, label: 'Chain Shot' },
  // A fire barrel: one charge, worth several balls, split evenly — it is a
  // blast, not an aimed shot.
  drop: { hull: 5.0, rig: 5.0, label: 'Fire Barrel' },
};

/** Standing spread of a volley, in radians of bearing and as a fraction of
 *  range. Holding aim narrows both toward AIM_SPREAD_FLOOR. */
const BEARING_SPREAD = 0.045;
const RANGE_SPREAD = 0.035;
/** Hold-to-aim narrows spread to roughly a third of standing — a placeholder
 *  curve, not a tuned one (see GAME_DESIGN.md). */
const AIM_SPREAD_FLOOR = 1 / 3;

/** Radius, in metres, the stern drop weapon's blast reaches on water contact. */
export const DROP_RADIUS = 10;

/** A hash-based unit random. Deterministic for a given (tick, ship, gun). */
function shotJitter(tick: number, shipId: number, gun: number, salt: number): number {
  let h = (tick * 73856093) ^ (shipId * 19349663) ^ (gun * 83492791) ^ (salt * 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Mounts `fireVolley` can fire. Stern is a drop weapon, not a volley — see
 *  `fireDropWeapon` below. */
export type VolleyMount = 'port' | 'starboard' | 'bow';

/**
 * Spawn a volley from one mount.
 *
 * Port/starboard are fixed broadside batteries, spaced along the hull: the
 * reticle sets range, bearing comes from steering. Bow chasers point along
 * the heading instead of off the beam — the one way to hit a target dead
 * ahead — and always load chain, since catching a faster ship is the only
 * reason to carry them.
 *
 * `aimHold` (0..1) is how long aim has been held: it narrows the standing
 * spread toward `AIM_SPREAD_FLOOR`, trading time exposed broadside-on for a
 * tighter pattern.
 */
export function fireVolley(
  ship: ShipState, mount: VolleyMount, aimRange: number, ammo: AmmoId, aimHold: number,
  tick: number, nextId: () => number,
): Projectile[] {
  const cls = SHIP_CLASSES[ship.cls];
  const out: Projectile[] = [];
  const muzzleY = cls.geo.depth - cls.geo.draft + 0.6;
  const spreadScale = 1 - Math.max(0, Math.min(1, aimHold)) * (1 - AIM_SPREAD_FLOOR);

  const isBow = mount === 'bow';
  const guns = isBow ? cls.combat.bowChasers.guns : cls.combat.gunsPerSide;
  // Broadside direction is the beam, rotated to the chosen side; bow chasers
  // fire straight along the heading.
  const fireDir = isBow ? ship.heading : ship.heading + ((mount === 'port' ? -1 : 1) * Math.PI) / 2;
  const fireAmmo: AmmoId = isBow ? 'chain' : ammo;

  for (let g = 0; g < guns; g++) {
    const t = guns === 1 ? 0.5 : g / (guns - 1);
    // Broadsides spread fore-aft along the hull where the ports are; bow
    // chasers sit side-by-side right at the bow instead.
    const along = isBow ? cls.geo.len * 0.46 : (t - 0.5) * cls.geo.len * 0.62;
    const lateral = isBow ? (t - 0.5) * cls.geo.beam * 0.5 : cls.geo.beam * 0.5;
    const lateralDir = isBow ? ship.heading + Math.PI / 2 : fireDir;

    const bearing = fireDir + (shotJitter(tick, ship.id, g, 1) - 0.5) * BEARING_SPREAD * spreadScale;
    const range = aimRange * (1 + (shotJitter(tick, ship.id, g, 2) - 0.5) * RANGE_SPREAD * spreadScale);
    const theta = elevationForRange(range);

    const horiz = MUZZLE_SPEED * Math.cos(theta);
    const vy = MUZZLE_SPEED * Math.sin(theta);

    out.push({
      id: nextId(),
      ownerId: ship.id,
      ammo: fireAmmo,
      x: ship.x + Math.sin(ship.heading) * along + Math.sin(lateralDir) * lateral,
      y: muzzleY,
      z: ship.z + Math.cos(ship.heading) * along + Math.cos(lateralDir) * lateral,
      vx: Math.sin(bearing) * horiz + Math.sin(ship.heading) * ship.speed,
      vy,
      vz: Math.cos(bearing) * horiz + Math.cos(ship.heading) * ship.speed,
      age: 0,
    });
  }
  return out;
}

/**
 * Drop one charge astern — a fire barrel or mine, not an aimed shot. It
 * carries the ship's own motion but starts with no vertical speed, so it
 * falls almost straight down into the wake close behind rather than arcing
 * out like a cannonball. Detonates in a radius on water contact (see
 * `stepProjectiles` in world.ts), punishing whatever is following too close.
 */
export function fireDropWeapon(ship: ShipState, tick: number, nextId: () => number): Projectile {
  const cls = SHIP_CLASSES[ship.cls];
  const muzzleY = cls.geo.depth - cls.geo.draft + 0.6;
  const astern = ship.heading + Math.PI;
  const jitter = (shotJitter(tick, ship.id, 0, 3) - 0.5) * 1.5;

  return {
    id: nextId(),
    ownerId: ship.id,
    ammo: 'drop',
    x: ship.x + Math.sin(astern) * (cls.geo.len * 0.55) + Math.sin(astern + Math.PI / 2) * jitter,
    y: muzzleY,
    z: ship.z + Math.cos(astern) * (cls.geo.len * 0.55) + Math.cos(astern + Math.PI / 2) * jitter,
    vx: Math.sin(ship.heading) * ship.speed * 0.6,
    vy: 0,
    vz: Math.cos(ship.heading) * ship.speed * 0.6,
    age: 0,
  };
}

/**
 * Is a point inside a ship's hit volume?
 *
 * Ships are one oriented box rather than separate hull and rig volumes. At
 * this scale, asking a player to hit a mast specifically would be fiddly and
 * unreadable; the ammo type decides which track takes the damage instead.
 */
export const PROJECTILE_RADIUS = 0.5;

export function hitsShip(ship: ShipState, px: number, py: number, pz: number): boolean {
  if (ship.sinking > 0) return false;
  const cls = SHIP_CLASSES[ship.cls];
  const dx = px - ship.x;
  const dz = pz - ship.z;

  // Into the ship's local frame: +Z along the hull, +X across the beam.
  const c = Math.cos(-ship.heading), s = Math.sin(-ship.heading);
  const localZ = dx * s + dz * c;
  const localX = dx * c - dz * s;

  const halfLen = cls.geo.len * 0.5 + PROJECTILE_RADIUS;
  const halfBeam = cls.geo.beam * 0.5 + PROJECTILE_RADIUS;
  const top = cls.geo.depth - cls.geo.draft + cls.geo.mastH * 0.35;
  const bottom = -cls.geo.draft;

  return Math.abs(localZ) <= halfLen && Math.abs(localX) <= halfBeam && py >= bottom && py <= top;
}

/** Apply one ball's (or one drop weapon's blast) damage. Returns true if
 *  this hit sank the ship. */
export function applyHit(ship: ShipState, ammo: ProjectileAmmo): boolean {
  const cls = SHIP_CLASSES[ship.cls];
  const mix = AMMO[ammo];
  ship.hull = Math.max(0, ship.hull - (DAMAGE_PER_BALL * mix.hull) / cls.combat.hullHp);
  ship.rig = Math.max(0, ship.rig - (DAMAGE_PER_BALL * mix.rig) / cls.combat.rigHp);
  return ship.hull <= 0;
}

/**
 * How much of its performance a ship still has, given rigging damage.
 * Never reaches zero — a dismasted ship still drifts, it is not a rock.
 */
export function rigEfficiency(rig: number): number {
  return 0.35 + 0.65 * Math.max(0, Math.min(1, rig));
}
