/* Gunnery ballistics.
 *
 * Broadside guns are fixed batteries: they point off the beam and cannot be
 * swung. The only thing the gunner controls is elevation, which sets range.
 * That is what makes a duel about steering the ship rather than aiming a
 * mouse, and it is why the reticle in the HUD sets a distance, not a bearing.
 *
 * Pure functions — no world state, no engine. MUST NOT import Babylon.
 */

import type { ProjectileAmmo } from './types.ts';

export const GRAVITY = 9.81;
/** Muzzle velocity in m/s. Gives a theoretical maximum of ~430 m. */
export const MUZZLE_SPEED = 65;
/** Guns will not be elevated past this, whatever the reticle says. */
export const MAX_RANGE = 250;
export const MIN_RANGE = 25;

/**
 * Elevation angle, in radians, that lands a shot at `range` on flat water.
 *
 * Uses the low-angle solution of the ballistic range equation
 * `R = v² sin(2θ) / g`. The high-angle (mortar) solution also reaches the
 * target but takes far longer to arrive, which would feel unresponsive.
 */
export function elevationForRange(range: number, speed = MUZZLE_SPEED): number {
  const clamped = Math.max(MIN_RANGE, Math.min(range, MAX_RANGE));
  const s = (clamped * GRAVITY) / (speed * speed);
  // s > 1 would mean the range is unreachable; clamp keeps this defined.
  return 0.5 * Math.asin(Math.max(0, Math.min(1, s)));
}

/** Time of flight to the point the shot was aimed at. */
export function timeOfFlight(range: number, speed = MUZZLE_SPEED): number {
  const theta = elevationForRange(range, speed);
  const horiz = speed * Math.cos(theta);
  return horiz > 0 ? Math.min(range, MAX_RANGE) / horiz : 0;
}

export interface Projectile {
  id: number;
  ownerId: number;
  ammo: ProjectileAmmo;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Ticks lived, so strays can be retired rather than flying forever. */
  age: number;
}

/** Advance one projectile by `dt` seconds under gravity. */
export function stepProjectile(p: Projectile, dt: number): void {
  p.vy -= GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  p.age++;
}
