/* Ship assembly.
 *
 * Transliterated from prototype/ships.js. The one deliberate omission is the
 * waterline clip: the prototype cut hulls off at the sea surface because a
 * painter's-algorithm renderer could not resolve a hull against huge ocean
 * facets. Babylon has a depth buffer, so the opaque ocean hides the submerged
 * hull correctly and the clip is unnecessary.
 */

import type { HullPalette, ShipClass } from '../data/shipClasses.ts';
import {
  hullSurfaceZ, makeBox, makeHull, makePlanks, makePrism, makeSail, makeTriSail,
  mergeMeshes, transformMesh, type Mesh, type Transform,
} from './geometry.ts';

interface Part { mesh: Mesh; t?: Transform }

/* Stacked square sails: course, topsail, topgallant. Each tier is shorter and
 * narrower than the one below, which is what tapers a full-rigged profile. */
const TIERS = [
  { at: 0.52, h: 0.34, w: 1.0 },
  { at: 0.78, h: 0.22, w: 0.8 },
  { at: 0.95, h: 0.14, w: 0.6 },
];

/** Build a ship in local space with the bow along +Z (the sim's heading 0). */
export function buildShipMesh(cls: ShipClass, p: HullPalette, seed = 3): Mesh {
  const { len, beam, depth, mastH, masts } = cls.geo;
  const parts: Part[] = [];
  const bulge = 0.9;

  parts.push({ mesh: makeHull(len, beam, depth, p.deck, p.hull, { keelRise: 0.5 }) });

  parts.push({
    mesh: makeHull(len * 1.008, beam * 1.035, 0.3, p.stripe, p.stripe, { keelTaper: 0.98, noCap: true }),
    t: { pos: [0, depth * 0.78, 0] },
  });

  const deckY = depth + 0.06;
  parts.push({
    mesh: makePlanks(len * 0.82, beam * 0.78, 11, p.deck, seed),
    t: { pos: [-len * 0.02, deckY, 0] },
  });

  // Open bulwark ring — no cap, so the planked deck reads through it.
  parts.push({
    mesh: makeHull(len * 0.99, beam * 0.99, 0.72, p.hullDark, p.hullDark, { keelTaper: 0.99, noCap: true }),
    t: { pos: [0, depth - 0.04, 0] },
  });

  // Gun ports, following the planking in both axes.
  const gunPorts = cls.geo.gunPorts ?? 0;
  const gunDecks = cls.geo.gunDecks ?? 1;
  if (gunPorts > 0) {
    const span = len * 0.62;
    const perDeck = Math.ceil(gunPorts / gunDecks);
    for (let d = 0; d < gunDecks; d++) {
      const portY = deckY - 0.62 - d * 0.95;
      for (let i = 0; i < perDeck; i++) {
        const t = perDeck === 1 ? 0.5 : i / (perDeck - 1);
        const px = -span / 2 + span * t - len * 0.03;
        const z = hullSurfaceZ(px / len, portY, beam, depth) + 0.02;
        for (const side of [-1, 1]) {
          parts.push({
            mesh: makeBox(len * 0.028, 0.5, 0.12, p.gunPort ?? p.hullDark),
            t: { pos: [px, portY, side * z] },
          });
        }
      }
    }
  }

  // Stern castle: one shallow deck reads as a sloop, four stacked as a galleon.
  const stern = cls.geo.sterncastle;
  let castleY = deckY;
  for (let d = 0; d < stern.decks; d++) {
    const shrink = 1 - d * 0.16;
    parts.push({
      mesh: makeBox(len * 0.26 * shrink, stern.height, beam * 0.72 * shrink, d % 2 ? p.cabin : p.deck),
      t: { pos: [-len * (0.32 + d * 0.012), castleY, 0] },
    });
    castleY += stern.height;
  }
  parts.push({
    mesh: makeBox(len * 0.2, 0.14, beam * 0.56, p.stripe),
    t: { pos: [-len * 0.34, castleY, 0] },
  });

  if (cls.geo.forecastle) {
    parts.push({ mesh: makeBox(len * 0.16, 0.55, beam * 0.6, p.deck), t: { pos: [len * 0.33, deckY, 0] } });
  }

  if (cls.geo.beakhead) {
    parts.push({
      mesh: makeBox(len * 0.16, 0.4, beam * 0.3, p.hullDark),
      t: { pos: [len * 0.5, depth * 0.72, 0], rotZ: 0.22 },
    });
    parts.push({
      mesh: makeBox(len * 0.1, 0.3, beam * 0.2, p.stripe),
      t: { pos: [len * 0.55, depth * 0.86, 0], rotZ: 0.22 },
    });
  }

  const mastBase = deckY;
  let tallest = { x: 0, top: 0 };

  for (const m of masts) {
    const mastX = len * m.xFrac;
    const h = mastH * m.heightFrac;

    parts.push({ mesh: makePrism(0.22, 0.13, h, 6, p.mast), t: { pos: [mastX, mastBase, 0] } });

    if (m.rig === 'square') {
      const tiers = Math.min(m.tiers ?? 2, TIERS.length);
      for (let t = 0; t < tiers; t++) {
        const tier = TIERS[t];
        const yardY = mastBase + h * tier.at;
        const w = beam * m.sailW * tier.w;
        parts.push({ mesh: makeBox(0.19, 0.19, w + beam * 0.12, p.mast), t: { pos: [mastX, yardY, 0] } });
        parts.push({
          mesh: makeSail(w, h * tier.h, bulge * tier.w, t === 0 ? p.sail : p.sailAlt, 5, 4),
          t: { pos: [mastX - 0.28 * tier.w, yardY - h * tier.h, 0], rotY: Math.PI / 2 },
        });
      }
    } else if (m.rig === 'foreaft') {
      const boomY = mastBase + 0.85;
      const clewX = mastX - len * 0.4;
      parts.push({ mesh: makeBox(len * 0.42, 0.15, 0.15, p.mast), t: { pos: [mastX - len * 0.21, boomY, 0] } });
      parts.push({
        mesh: makeTriSail(mastX + 0.1, mastBase + h * 0.97, mastX + 0.1, boomY + 0.15, clewX, boomY + 0.35, bulge * 0.8, p.sail, 4),
      });
    } else {
      const tackX = mastX + len * 0.09, tackY = mastBase + h * 0.28;
      const peakX = mastX - len * 0.13, peakY = mastBase + h * 1.04;
      const clewX = mastX - len * 0.15, clewY = mastBase + 0.9;
      const dx = peakX - tackX, dy = peakY - tackY;
      parts.push({
        mesh: makeBox(Math.hypot(dx, dy), 0.16, 0.16, p.mast),
        t: { pos: [(tackX + peakX) / 2, (tackY + peakY) / 2, 0], rotZ: Math.atan2(dy, dx) },
      });
      parts.push({ mesh: makeTriSail(tackX, tackY, peakX, peakY, clewX, clewY, bulge * 0.7, p.sail, 4) });
    }

    if (m.spanker) {
      parts.push({
        mesh: makeTriSail(mastX - 0.1, mastBase + h * 0.66, mastX - 0.1, mastBase + 1.0, mastX - len * 0.15, mastBase + 1.15, bulge * 0.6, p.sailAlt, 3),
      });
    }
    if (m.staysail) {
      parts.push({
        mesh: makeTriSail(mastX + 0.1, mastBase + h * 0.8, mastX + len * 0.15, mastBase + 1.3, mastX + 0.1, mastBase + 1.3, bulge * 0.5, p.sailAlt, 3),
      });
    }

    if (mastBase + h > tallest.top) tallest = { x: mastX, top: mastBase + h };
  }

  // Jib from the bowsprit tip to the foremost mast.
  const foremost = masts.reduce((a, b) => (b.xFrac > a.xFrac ? b : a));
  const foreX = len * foremost.xFrac;
  const foreH = mastH * foremost.heightFrac;
  parts.push({
    mesh: makeTriSail(len * 0.66, depth + 0.5, foreX + 0.3, mastBase + foreH * 0.58, len * 0.18, deckY + 0.35, bulge * 0.66, p.sail, 3),
  });

  parts.push({
    mesh: makePrism(0.15, 0.08, len * 0.28, 5, p.mast),
    t: { pos: [len * 0.46, depth + 0.45, 0], rotZ: -Math.PI / 2 + 0.26 },
  });

  parts.push({
    mesh: makeSail(1.5, 0.5, 0.14, p.flag, 3, 1),
    t: { pos: [tallest.x + 0.72, tallest.top - 0.75, 0], rotY: Math.PI / 2 },
  });

  const baked = parts.map((part) => transformMesh(part.mesh, part.t ?? {}));
  // Built bow-along-+X like the prototype; rotate so the bow points along +Z,
  // which is the simulation's heading zero.
  return transformMesh(mergeMeshes(baked), { rotY: -Math.PI / 2 });
}
