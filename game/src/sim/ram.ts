/* Hull-on-hull contact: keeping ships out of each other, and ramming.
 *
 * Each hull is a capsule — its centreline from stern to bow, swept by half
 * the beam. That is close enough to the box `hitsShip` uses for shot that a
 * player cannot tell the difference, and capsules give a clean contact normal
 * where two boxes would need SAT and corner cases.
 *
 * Damage comes from the closing speed along that normal, so a glancing scrape
 * costs little and a bow driven square into a broadside costs a lot. The ship
 * whose bow did the hitting takes a fraction of what it deals — that is what
 * makes it a ram rather than a collision.
 *
 * Deterministic, no engine imports. MUST NOT import Babylon.
 */

import { SHIP_CLASSES } from '../data/shipClasses.ts';
import type { ShipState } from './types.ts';

/** Closing speed, m/s, below which contact only shoves — no damage. */
export const RAM_MIN_SPEED = 2.0;
/** Hull points dealt per unit of impact momentum (closing speed x reduced
 *  mass). Tuned so a boosting brig takes about half a brig's hull. */
export const RAM_DAMAGE_K = 0.02;
/** Fraction of the damage the ramming ship takes itself. */
export const RAMMER_SHARE = 0.25;
/** After a damaging contact, neither ship can be hurt by another ram for
 *  this long — one hit, not a grind of hits every tick while hulls touch. */
export const RAM_COOLDOWN_TICKS = 30;
/** Fraction of each ship's speed *into* the contact that the impact kills. */
const IMPACT_SPEED_LOSS = 0.8;
/** How closely a bow has to point at the contact to count as the rammer. */
const BOW_ALIGN = 0.5;

/** Mass proxy: displaced volume, near enough. Only ratios matter. */
export function shipMass(s: ShipState): number {
  const g = SHIP_CLASSES[s.cls].geo;
  return g.len * g.beam * g.depth;
}

interface Capsule { ax: number; az: number; bx: number; bz: number; r: number }

/** Stern (a) to bow (b) centreline, shortened by the radius so the rounded
 *  ends land at the stem and stern. */
function capsule(s: ShipState): Capsule {
  const g = SHIP_CLASSES[s.cls].geo;
  const r = g.beam * 0.5;
  const half = Math.max(0, g.len * 0.5 - r);
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  return { ax: s.x - fx * half, az: s.z - fz * half, bx: s.x + fx * half, bz: s.z + fz * half, r };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Closest points between two segments (Ericson, Real-Time Collision
 *  Detection 5.1.9). Returns the parameter along each, 0 = stern, 1 = bow. */
function closestParams(p: Capsule, q: Capsule): { s: number; t: number } {
  const d1x = p.bx - p.ax, d1z = p.bz - p.az;
  const d2x = q.bx - q.ax, d2z = q.bz - q.az;
  const rx = p.ax - q.ax, rz = p.az - q.az;
  const a = d1x * d1x + d1z * d1z;
  const e = d2x * d2x + d2z * d2z;
  const f = d2x * rx + d2z * rz;
  if (a <= 1e-9 && e <= 1e-9) return { s: 0, t: 0 };
  if (a <= 1e-9) return { s: 0, t: clamp01(f / e) };
  const c = d1x * rx + d1z * rz;
  if (e <= 1e-9) return { s: clamp01(-c / a), t: 0 };
  const b = d1x * d2x + d1z * d2z;
  const denom = a * e - b * b;
  let s = denom > 1e-9 ? clamp01((b * f - c * e) / denom) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp01(-c / a); } else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
  return { s, t };
}

export interface RamResult {
  x: number;
  z: number;
  /** Hull fraction (0..1) each ship lost; zero for a shove under threshold. */
  damageA: number;
  damageB: number;
  /** id of the ship whose bow did the hitting, or -1 if neither or both. */
  rammerId: number;
}

/**
 * Resolve contact between two afloat ships, mutating position and speed.
 * Returns null if the hulls do not touch. `canDamage` is false while either
 * ship is still in its post-ram cooldown: they are still pushed apart.
 */
export function resolveContact(A: ShipState, B: ShipState, canDamage: boolean): RamResult | null {
  const p = capsule(A), q = capsule(B);
  const { s, t } = closestParams(p, q);
  const cax = p.ax + (p.bx - p.ax) * s, caz = p.az + (p.bz - p.az) * s;
  const cbx = q.ax + (q.bx - q.ax) * t, cbz = q.az + (q.bz - q.az) * t;
  let nx = cbx - cax, nz = cbz - caz;
  const dist = Math.hypot(nx, nz);
  const reach = p.r + q.r;
  if (dist >= reach) return null;

  // Normal from A toward B. Coincident centrelines have none, so fall back
  // to centre-to-centre, then to A's beam — anything consistent will do.
  if (dist > 1e-6) { nx /= dist; nz /= dist; } else {
    const cx = B.x - A.x, cz = B.z - A.z, cd = Math.hypot(cx, cz);
    if (cd > 1e-6) { nx = cx / cd; nz = cz / cd; } else { nx = Math.cos(A.heading); nz = -Math.sin(A.heading); }
  }

  const mA = shipMass(A), mB = shipMass(B);
  const fAx = Math.sin(A.heading), fAz = Math.cos(A.heading);
  const fBx = Math.sin(B.heading), fBz = Math.cos(B.heading);

  // Push apart, the lighter hull giving more ground.
  const overlap = reach - Math.max(0, dist);
  const shareA = mB / (mA + mB);
  A.x -= nx * overlap * shareA; A.z -= nz * overlap * shareA;
  B.x += nx * overlap * (1 - shareA); B.z += nz * overlap * (1 - shareA);

  // Velocity of each ship along the normal, positive = toward the other.
  const intoA = A.speed * (fAx * nx + fAz * nz);
  const intoB = -B.speed * (fBx * nx + fBz * nz);
  const closing = Math.max(0, intoA) + Math.max(0, intoB);

  if (intoA > 0) A.speed = Math.max(0, A.speed - intoA * IMPACT_SPEED_LOSS);
  if (intoB > 0) B.speed = Math.max(0, B.speed - intoB * IMPACT_SPEED_LOSS);

  const x = (cax + cbx) / 2, z = (caz + cbz) / 2;
  if (!canDamage || closing < RAM_MIN_SPEED) return { x, z, damageA: 0, damageB: 0, rammerId: -1 };

  // A bow counts when the contact is at the bow end and the ship is pointed
  // at what it hit — not when it is merely sailing past with its stem nearby.
  const bowA = s > 0.75 && (fAx * nx + fAz * nz) > BOW_ALIGN;
  const bowB = t > 0.75 && -(fBx * nx + fBz * nz) > BOW_ALIGN;

  const momentum = closing * (mA * mB) / (mA + mB);
  // Heavier hulls shrug off lighter ones and crush them in turn.
  const hpA = RAM_DAMAGE_K * momentum * Math.sqrt(mB / mA) * (bowA ? RAMMER_SHARE : 1);
  const hpB = RAM_DAMAGE_K * momentum * Math.sqrt(mA / mB) * (bowB ? RAMMER_SHARE : 1);
  const damageA = hpA / SHIP_CLASSES[A.cls].combat.hullHp;
  const damageB = hpB / SHIP_CLASSES[B.cls].combat.hullHp;
  A.hull = Math.max(0, A.hull - damageA);
  B.hull = Math.max(0, B.hull - damageB);

  const rammerId = bowA && !bowB ? A.id : bowB && !bowA ? B.id : -1;
  return { x, z, damageA, damageB, rammerId };
}
