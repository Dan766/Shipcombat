/* Ship class roster.

   Pure data plus one placement helper. `geo` feeds buildShip (ships.js),
   `stats` are 1-5 ratings for the mockup's bars, and the display fields are
   the copy shown on the classes page.

   Balance model is linear tiers: speed and turn are traded for hull and
   broadside weight, monotonically from Sloop to Galleon. No matchup counters
   — a heavier ship beats a lighter one in a straight trade, and the lighter
   ship's job is to not take that trade. Numbers are relative placeholders.

   Load order: lowpoly3d.js -> ships.js -> shipclasses.js -> scenes.js */

const SHIP_CLASSES = {
  sloop: {
    id: 'sloop',
    name: 'Sloop',
    role: 'Skirmisher',
    blurb: 'Single mast, four guns a side, and the tightest turn in the game. ' +
      'Wins by choosing when to be in range at all — it loses any trade it stays in.',
    length: '16 m',
    crew: 12,
    guns: 8,
    stats: { speed: 5, turn: 5, hull: 2, broadside: 2 },
    geo: {
      len: 16, beam: 5.0, depth: 2.6, draft: 1.45, gunPorts: 4,
      sterncastle: { decks: 1, height: 0.62 },
      masts: [
        { xFrac: -0.03, heightFrac: 1.0, yardFrac: 0.62, sailW: 1.6, topsail: true },
      ],
    },
  },

  brig: {
    id: 'brig',
    name: 'Brig',
    role: 'All-rounder',
    blurb: 'Two masts and eight guns a side. Quick enough to pick fights and ' +
      'solid enough to finish them — the default pick, and the yardstick for the rest.',
    length: '21 m',
    crew: 24,
    guns: 16,
    stats: { speed: 4, turn: 4, hull: 3, broadside: 3 },
    geo: {
      len: 21, beam: 6.2, depth: 3.0, draft: 1.7, gunPorts: 8,
      sterncastle: { decks: 2, height: 0.6 },
      masts: [
        { xFrac: 0.18, heightFrac: 0.9, yardFrac: 0.62, sailW: 1.35, topsail: true },
        { xFrac: -0.14, heightFrac: 1.0, yardFrac: 0.6, sailW: 1.5, topsail: true },
      ],
    },
  },

  frigate: {
    id: 'frigate',
    name: 'Frigate',
    role: 'Line fighter',
    blurb: 'Three masts, fourteen guns a side, and a hull that can absorb a ' +
      'full broadside. Slow to turn, so it fights by committing to a heading early.',
    length: '27 m',
    crew: 42,
    guns: 28,
    stats: { speed: 3, turn: 3, hull: 4, broadside: 4 },
    geo: {
      len: 27, beam: 7.6, depth: 3.6, draft: 2.0, gunPorts: 14, forecastle: true,
      sterncastle: { decks: 3, height: 0.58 },
      masts: [
        { xFrac: 0.26, heightFrac: 0.82, yardFrac: 0.62, sailW: 1.15, topsail: true },
        { xFrac: 0.0, heightFrac: 1.0, yardFrac: 0.6, sailW: 1.35, topsail: true },
        { xFrac: -0.26, heightFrac: 0.86, yardFrac: 0.62, sailW: 1.1, topsail: true },
      ],
    },
  },

  galleon: {
    id: 'galleon',
    name: 'Galleon',
    role: 'Fortress',
    blurb: 'Four masts, twenty-two guns a side, and a stern castle you can see ' +
      'from across the map. Turns like a cathedral; anything that gets alongside it dies.',
    length: '34 m',
    crew: 68,
    guns: 44,
    stats: { speed: 2, turn: 1, hull: 5, broadside: 5 },
    geo: {
      len: 34, beam: 9.6, depth: 4.4, draft: 2.5, gunPorts: 22, forecastle: true,
      sterncastle: { decks: 4, height: 0.62 },
      masts: [
        { xFrac: 0.3, heightFrac: 0.76, yardFrac: 0.62, sailW: 0.95, topsail: true },
        { xFrac: 0.08, heightFrac: 1.0, yardFrac: 0.6, sailW: 1.2, topsail: true },
        { xFrac: -0.15, heightFrac: 0.92, yardFrac: 0.6, sailW: 1.1, topsail: true },
        { xFrac: -0.34, heightFrac: 0.7, yardFrac: 0.66, sailW: 0.8, topsail: false },
      ],
    },
  },
};

const SHIP_CLASS_ORDER = ['sloop', 'brig', 'frigate', 'galleon'];

// Merge a class's geometry with placement/appearance and build it.
function buildClassShip(classId, placement) {
  const cls = SHIP_CLASSES[classId];
  const cfg = {};
  for (const k in cls.geo) cfg[k] = cls.geo[k];
  for (const k in placement) cfg[k] = placement[k];
  // Sit the hull at its own draft unless the caller pinned an explicit y.
  const pos = placement.pos || [0, 0, 0];
  cfg.pos = [pos[0], pos[1] == null ? -cls.geo.draft : pos[1], pos[2]];
  return buildShip(cfg);
}
