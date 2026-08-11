/* Ship + prop assembly on top of lowpoly3d primitives.
   Ships are authored in local space (bow toward +x, mast up +y) and baked
   into world space so the renderer only ever sees flat meshes. */

function bakeParts(parts, outer) {
  const out = [];
  for (const p of parts) {
    const local = transformMesh(p.mesh, p.t || {});
    out.push({ mesh: transformMesh(local, outer), clipBelow: outer.clipBelow });
  }
  return out;
}

// Default rig: a single mast, i.e. the sloop. Classes override this with
// their own mast list — see shipclasses.js.
const DEFAULT_MASTS = [{ xFrac: -0.03, heightFrac: 0.8, yardFrac: 0.62, sailW: 1.6, topsail: true }];

function buildShip(cfg) {
  const p = cfg.palette;
  const len = cfg.len || 16;
  const beam = cfg.beam || 5;
  const depth = cfg.depth || 2.6;
  const masts = cfg.masts || DEFAULT_MASTS;
  const parts = [];

  parts.push({ mesh: makeHull(len, beam, depth, p.deck, p.hull, { keelRise: 0.5 }), t: {} });

  // Waterline stripe — sits clear of the sea surface so wave crests never
  // slice it into floating slivers.
  parts.push({
    mesh: makeHull(len * 1.008, beam * 1.035, 0.3, p.stripe, p.stripe, { keelTaper: 0.98, noCap: true }),
    t: { pos: [0, depth * 0.78, 0] },
  });

  const deckY = depth + 0.06;
  parts.push({
    mesh: makePlanks(len * 0.82, beam * 0.78, 11, p.deck, cfg.seed || 3),
    t: { pos: [-len * 0.02, deckY, 0] },
  });

  // Open bulwark ring — no cap, so the planked deck reads through it.
  parts.push({
    mesh: makeHull(len * 0.99, beam * 0.99, 0.72, p.hullDark, p.hullDark, { keelTaper: 0.99, noCap: true }),
    t: { pos: [0, depth - 0.04, 0] },
  });

  // Gun ports: the clearest read on how heavy a ship is. Confined to the
  // parallel midships run so they can sit at a fixed beam offset without
  // drifting off the tapered bow and stern.
  const gunPorts = cfg.gunPorts || 0;
  if (gunPorts > 0) {
    const span = len * 0.62;
    const portY = deckY - 0.62;
    for (let i = 0; i < gunPorts; i++) {
      const t = gunPorts === 1 ? 0.5 : i / (gunPorts - 1);
      const px = -span / 2 + span * t - len * 0.03;
      for (const side of [-1, 1]) {
        parts.push({
          mesh: makeBox(len * 0.028, 0.5, 0.12, p.gunPort || p.hullDark),
          t: { pos: [px, portY, side * beam * 0.475] },
        });
      }
    }
  }

  // Stern castle: a stack of progressively smaller decks. One shallow deck
  // reads as a sloop's quarterdeck; four stacked reads as a galleon.
  const stern = cfg.sterncastle || { decks: 2, height: 0.62 };
  let castleY = deckY;
  for (let d = 0; d < stern.decks; d++) {
    const shrink = 1 - d * 0.16;
    parts.push({
      mesh: makeBox(len * 0.26 * shrink, stern.height, beam * 0.72 * shrink, d % 2 ? p.cabin : p.deck),
      t: { pos: [-len * (0.32 + d * 0.012), castleY, 0] },
    });
    castleY += stern.height;
  }
  // Taffrail cap on top of the stack
  parts.push({
    mesh: makeBox(len * 0.2, 0.14, beam * 0.56, p.stripe),
    t: { pos: [-len * 0.34, castleY, 0] },
  });

  if (cfg.forecastle) {
    parts.push({
      mesh: makeBox(len * 0.16, 0.55, beam * 0.6, p.deck),
      t: { pos: [len * 0.33, deckY, 0] },
    });
  }

  const mastBase = deckY;
  const baseMastH = cfg.mastH || len * 0.8;
  let tallest = null;

  masts.forEach(function (m) {
    const mastX = len * m.xFrac;
    const mastH = baseMastH * m.heightFrac;
    const yardY = mastBase + mastH * m.yardFrac;

    parts.push({
      mesh: makePrism(0.22, 0.13, mastH, 6, p.mast),
      t: { pos: [mastX, mastBase, 0] },
    });
    parts.push({
      mesh: makeBox(0.2, 0.2, beam * (m.sailW + 0.12), p.mast),
      t: { pos: [mastX, yardY, 0] },
    });

    if (!cfg.furled) {
      // Main course: square sail hung from the yard.
      parts.push({
        mesh: makeSail(beam * m.sailW, mastH * 0.44, cfg.bulge == null ? 0.9 : cfg.bulge, p.sail, 5, 4),
        t: { pos: [mastX - 0.3, yardY - mastH * 0.44, 0], rotY: Math.PI / 2 },
      });
      if (m.topsail) {
        parts.push({
          mesh: makeSail(beam * m.sailW * 0.7, mastH * 0.2, 0.55, p.sailAlt, 4, 3),
          t: { pos: [mastX - 0.22, yardY + 0.06, 0], rotY: Math.PI / 2 },
        });
      }
    }

    if (!tallest || mastBase + mastH > tallest.top) {
      tallest = { x: mastX, top: mastBase + mastH };
    }
  });

  // Jib: strung from the bowsprit tip up to the foremost mast.
  const foremost = masts.reduce(function (a, b) { return b.xFrac > a.xFrac ? b : a; });
  if (!cfg.furled) {
    const foreX = len * foremost.xFrac;
    const foreH = baseMastH * foremost.heightFrac;
    parts.push({
      mesh: makeTriSail(len * 0.66, depth + 0.5, foreX + 0.3, mastBase + foreH * 0.58, len * 0.18, deckY + 0.35, 0.6, p.sail, 3),
      t: {},
    });
  }

  parts.push({
    mesh: makePrism(0.15, 0.08, len * 0.28, 5, p.mast),
    t: { pos: [len * 0.46, depth + 0.45, 0], rotZ: -Math.PI / 2 + 0.26 },
  });

  // Masthead pennant on the tallest mast — narrow, so it reads as a flag.
  parts.push({
    mesh: makeSail(1.5, 0.5, 0.14, p.flag, 3, 1),
    t: { pos: [tallest.x + 0.72, tallest.top - 0.75, 0], rotY: Math.PI / 2 },
  });

  return bakeParts(parts, {
    pos: cfg.pos || [0, 0, 0],
    rotY: cfg.rotY || 0,
    rotZ: cfg.heel || 0,
    scale: cfg.scale == null ? 1 : cfg.scale,
    clipBelow: cfg.clipBelow == null ? -0.55 : cfg.clipBelow,
  });
}

// Rocky island with a couple of trees — used to give the horizon something
// to read against and to show off the distance haze.
function buildIsland(cfg) {
  const parts = [];
  const r = cfg.r || 10;
  parts.push({ mesh: makeDome(r, cfg.h || 5, 9, 3, cfg.rock || '#a3937c', cfg.seed || 7, 0.3), t: {} });
  // Grass cap: wide and shallow, so the island reads as a headland rather
  // than a mushroom.
  parts.push({
    mesh: makeDome(r * 0.88, (cfg.h || 5) * 0.3, 8, 2, cfg.grass || '#6f9a52', (cfg.seed || 7) + 3, 0.25),
    t: { pos: [0, (cfg.h || 5) * 0.66, 0] },
  });
  if (cfg.trees) {
    const rng = seededRandom((cfg.seed || 7) + 11);
    for (let i = 0; i < cfg.trees; i++) {
      const a = rng() * Math.PI * 2;
      const d = r * 0.45 * rng();
      const tp = makeTree(2.6 + rng() * 1.2, 1.9 + rng() * 0.8, cfg.trunk || '#6b4a2f', cfg.leaf || '#4f9440', 20 + i);
      for (const part of tp) {
        parts.push({
          mesh: part.mesh,
          t: { pos: [Math.cos(a) * d + part.pos[0], (cfg.h || 5) * 0.72 + part.pos[1], Math.sin(a) * d + part.pos[2]] },
        });
      }
    }
  }
  return bakeParts(parts, { pos: cfg.pos || [0, 0, 0], rotY: cfg.rotY || 0, scale: cfg.scale == null ? 1 : cfg.scale });
}

// Pale disc of foam at a hull's waterline — the contact detail that stops a
// ship from looking pasted on top of the sea.
function buildFoam(cfg) {
  const disc = makePrism(cfg.r, cfg.r * 0.99, 0.02, 11, cfg.color || '#dff2f4');
  return [{
    mesh: transformMesh(disc, {
      pos: cfg.pos, rotY: cfg.rotY || 0, scaleX: 1, scaleZ: cfg.squash == null ? 0.5 : cfg.squash, scaleY: 1,
    }),
    alphaOverride: cfg.alpha == null ? 0.5 : cfg.alpha,
  }];
}

// Flat translucent quad sitting just above the water, used for hull shadows
// and firing-arc hints.
function buildQuad(cfg) {
  const m = mesh();
  const w = cfg.w, d = cfg.d;
  m.verts = [[-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2]];
  addFace(m, [0, 1, 2, 3], cfg.color, { alpha: cfg.alpha, noCull: true });
  return [{ mesh: transformMesh(m, { pos: cfg.pos, rotY: cfg.rotY || 0, scale: 1 }) }];
}
