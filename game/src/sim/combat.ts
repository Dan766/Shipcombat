/* Gunnery: firing volleys, hitting things, and what damage does.
 *
 * Deterministic throughout — spread comes from a seeded generator keyed on the
 * shot, never Math.random, so a replayed command log produces an identical
 * fight. MUST NOT import Babylon.
 */

import { SHIP_CLASSES } from '../data/shipClasses.ts';
import { elevationForRange, MUZZLE_SPEED, type Projectile } from './ballistics.ts';
import type { AmmoId, ShipState } from './types.ts';

/** Damage one ball carries. Everything else scales off this. */
export const DAMAGE_PER_BALL = 3.0;

/** How each ammo splits its damage between the two tracks. */
export const AMMO: Record<AmmoId, { hull: number; rig: number; label: string }> = {
  // Solid shot: all of it into the hull. The way you actually sink something.
  round: { hull: 1.0, rig: 0.15, label: 'Round Shot' },
  // Chain: tears rigging apart, barely scratches timber. The way you catch
  // something faster than you — the only reason to ever load it.
  chain: { hull: 0.25, rig: 1.0, label: 'Chain Shot' },
};

/** Spread of a volley, in radians of bearing and as a fraction of range. */
const BEARING_SPREAD = 0.045;
const RANGE_SPREAD = 0.035;

/** A hash-based unit random. Deterministic for a given (tick, ship, gun). */
function shotJitter(tick: number, shipId: number, gun: number, salt: number): number {
  let h = (tick * 73856093) ^ (shipId * 19349663) ^ (gun * 83492791) ^ (salt * 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Spawn a broadside. `side` is -1 for port, +1 for starboard.
 *
 * Guns fire off the beam, spaced along the hull, with a small spread in
 * bearing and range so a volley lands as a pattern rather than a point.
 */
export function fireVolley(
  ship: ShipState, side: -1 | 1, aimRange: number, ammo: AmmoId,
  tick: number, nextId: () => number,
): Projectile[] {
  const cls = SHIP_CLASSES[ship.cls];
  const guns = cls.combat.gunsPerSide;
  const out: Projectile[] = [];

  // Beam direction: heading rotated 90 degrees to the chosen side.
  const beam = ship.heading + (side * Math.PI) / 2;
  const muzzleY = cls.geo.depth - cls.geo.draft + 0.6;

  for (let g = 0; g < guns; g++) {
    const t = guns === 1 ? 0.5 : g / (guns - 1);
    // Spread guns along the middle of the hull, where the ports are.
    const along = (t - 0.5) * cls.geo.len * 0.62;
    const bearing = beam + (shotJitter(tick, ship.id, g, 1) - 0.5) * BEARING_SPREAD;
    const range = aimRange * (1 + (shotJitter(tick, ship.id, g, 2) - 0.5) * RANGE_SPREAD);
    const theta = elevationForRange(range);

    const horiz = MUZZLE_SPEED * Math.cos(theta);
    const vy = MUZZLE_SPEED * Math.sin(theta);

    out.push({
      id: nextId(),
      ownerId: ship.id,
      ammo,
      x: ship.x + Math.sin(ship.heading) * along + Math.sin(beam) * (cls.geo.beam * 0.5),
      y: muzzleY,
      z: ship.z + Math.cos(ship.heading) * along + Math.cos(beam) * (cls.geo.beam * 0.5),
      vx: Math.sin(bearing) * horiz + Math.sin(ship.heading) * ship.speed,
      vy,
      vz: Math.cos(bearing) * horiz + Math.cos(ship.heading) * ship.speed,
      age: 0,
    });
  }
  return out;
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

/** Apply one ball's damage. Returns true if this hit sank the ship. */
export function applyHit(ship: ShipState, ammo: AmmoId): boolean {
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
