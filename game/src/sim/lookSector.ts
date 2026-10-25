/* Look-directed weapon select: camera yaw off the bow picks the armed
 * weapon. Ported verbatim from prototype/scenes.js (LOOK_ARCS / inLookArc /
 * armedSectorFor) — that file is the frozen mockup this scheme was designed
 * against, and verify-controls-mockup.mjs already asserts this exact
 * arithmetic (360deg tiling, no 0/3+-stable bearing) against the mockup's
 * copy. Keeping the numbers identical here means the two can't drift apart.
 *
 * Pure — no Babylon, no world state. Degrees, continuous domain (not wrapped
 * to +-180): cos/sin handle any angle, and a continuous domain means no
 * sector has to be special-cased at the wrap seam.
 *
 * Lives beside ballistics.ts/wind.ts rather than under src/input: the camera
 * yaw that feeds this is a client concept, but the arc math itself is shared,
 * engine-free geometry the wire type (Command.fire) depends on.
 *
 * MUST NOT import Babylon.
 */

export type FireMount = 'bow' | 'starboard' | 'stern' | 'port';

interface LookArc {
  id: FireMount;
  from: number;
  to: number;
}

/** 0 = straight ahead, +90 = starboard, +-180 = stern, -90 = port. */
export const LOOK_ARCS: LookArc[] = [
  { id: 'bow', from: -30, to: 30 },
  { id: 'starboard', from: 30, to: 150 },
  { id: 'stern', from: 150, to: 210 },
  { id: 'port', from: 210, to: 330 },
];

export const LOOK_HYSTERESIS_DEG = 4;

function inLookArc(bearingDeg: number, arc: LookArc, pad: number): boolean {
  for (const off of [-360, 0, 360]) {
    const b = bearingDeg + off;
    if (b >= arc.from - pad && b <= arc.to + pad) return true;
  }
  return false;
}

/**
 * Sticky sector pick: the currently-armed sector keeps its grip on the
 * bearing until the camera clears its hysteresis band, so a look direction
 * resting on a seam cannot flicker between two armed weapons.
 */
export function armedMountFor(bearingDeg: number, last: FireMount | null): FireMount {
  if (last) {
    const cur = LOOK_ARCS.find((a) => a.id === last);
    if (cur && inLookArc(bearingDeg, cur, LOOK_HYSTERESIS_DEG)) return last;
  }
  const hit = LOOK_ARCS.find((a) => inLookArc(bearingDeg, a, 0));
  return hit ? hit.id : (last ?? 'bow');
}
