/* Points of sail.
 *
 * The one rule that makes heading a decision rather than a direction: how
 * fast you go depends on your angle to the wind. Sailing straight into it
 * leaves you in irons; a beam reach is fastest.
 *
 * MUST NOT import Babylon.
 */

/** Wrap to (-PI, PI]. */
export function normalizeAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x <= -Math.PI) x += Math.PI * 2;
  return x;
}

/**
 * Angle between a heading and the direction the wind comes from, in radians,
 * always 0..PI. Zero means pointing straight into the wind.
 */
export function angleOffWind(heading: number, windFrom: number): number {
  return Math.abs(normalizeAngle(heading - windFrom));
}

/* Curve control points: degrees off the wind -> speed multiplier.
 *
 * The design doc states this as flat zones (in irons / close-hauled / beam
 * reach / broad reach / running). Flat zones feel like a gearbox when you
 * steer across a boundary, so the zone values are interpolated instead — same
 * intent, continuous response. */
const CURVE: Array<[number, number]> = [
  [0, 0.12],
  [35, 0.30],
  [50, 0.65],
  [75, 0.92],
  [100, 1.0],
  [130, 0.95],
  [160, 0.82],
  [180, 0.75],
];

/** Speed multiplier for an angle off the wind, in radians. */
export function pointOfSail(offWindRad: number): number {
  const deg = (Math.min(Math.abs(offWindRad), Math.PI) * 180) / Math.PI;
  for (let i = 0; i < CURVE.length - 1; i++) {
    const [d0, m0] = CURVE[i];
    const [d1, m1] = CURVE[i + 1];
    if (deg <= d1) {
      const t = d1 === d0 ? 0 : (deg - d0) / (d1 - d0);
      return m0 + (m1 - m0) * t;
    }
  }
  return CURVE[CURVE.length - 1][1];
}

/** Human-readable zone, for the HUD. */
export function pointOfSailName(offWindRad: number): string {
  const deg = (Math.min(Math.abs(offWindRad), Math.PI) * 180) / Math.PI;
  if (deg < 40) return 'In Irons';
  if (deg < 70) return 'Close Hauled';
  if (deg < 120) return 'Beam Reach';
  if (deg < 160) return 'Broad Reach';
  return 'Running';
}
