/* Wave field.
 *
 * Ported from `makeOcean` in prototype/lowpoly3d.js and shared by the
 * simulation and the renderer — buoyancy and the visible surface must be the
 * same function or ships float at the wrong height.
 *
 * Pure and deterministic: height depends only on position and amplitude.
 * MUST NOT import Babylon.
 */

/**
 * Sea surface height at a world position.
 *
 * The distance damping in the prototype existed to flatten the horizon in a
 * static shot; here the field must be uniform, because a ship sailing outward
 * would otherwise find the sea quietly going calm around it.
 */
export function waveHeight(x: number, z: number, amp: number): number {
  return (
    Math.sin(x * 0.19 + z * 0.13) * 0.62 +
    Math.sin(x * 0.08 - z * 0.27) * 0.44 +
    Math.sin(z * 0.44 + x * 0.05) * 0.24
  ) * amp;
}

/**
 * Surface normal, from finite differences of `waveHeight`. Used to lean ships
 * with the water rather than keeping them rigidly level.
 */
export function waveNormal(x: number, z: number, amp: number, eps = 0.6): [number, number, number] {
  const hL = waveHeight(x - eps, z, amp);
  const hR = waveHeight(x + eps, z, amp);
  const hD = waveHeight(x, z - eps, amp);
  const hU = waveHeight(x, z + eps, amp);
  const nx = hL - hR;
  const nz = hD - hU;
  const ny = 2 * eps;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}
