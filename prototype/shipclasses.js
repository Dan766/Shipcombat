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
    rig: 'Fore-and-aft',
    blurb: 'The only fore-and-aft rig in the roster — one tall mainsail and a jib, ' +
      'no square canvas at all. Four guns a side and the tightest turn in the game: ' +
      'it wins by choosing whether to be in range, and loses any trade it stays in.',
    length: '16 m',
    crew: 12,
    guns: 8,
    stats: { speed: 5, turn: 5, hull: 2, broadside: 2 },
    geo: {
      // Sleekest hull in the roster (L:B 3.9) and the lowest freeboard.
      len: 16, beam: 4.1, depth: 2.5, draft: 1.15, gunPorts: 4, mastH: 15.4,
      sterncastle: { decks: 1, height: 0.5 },
      masts: [
        { xFrac: 0.06, heightFrac: 1.0, rig: 'foreaft', sailW: 1.6 },
      ],
    },
  },

  brig: {
    id: 'brig',
    name: 'Brig',
    role: 'All-rounder',
    rig: 'Square, 2 masts',
    blurb: 'Two square-rigged masts and a spanker aft, eight guns a side. Quick ' +
      'enough to pick fights and solid enough to finish them — the default pick, ' +
      'and the yardstick the others are measured against.',
    length: '21 m',
    crew: 24,
    guns: 16,
    stats: { speed: 4, turn: 4, hull: 3, broadside: 3 },
    geo: {
      len: 21, beam: 6.0, depth: 3.1, draft: 1.5, gunPorts: 8, mastH: 16.5,
      sterncastle: { decks: 2, height: 0.58 },
      masts: [
        { xFrac: 0.2, heightFrac: 0.92, rig: 'square', tiers: 2, sailW: 1.35, staysail: true },
        { xFrac: -0.16, heightFrac: 1.0, rig: 'square', tiers: 2, sailW: 1.5, spanker: true },
      ],
    },
  },

  frigate: {
    id: 'frigate',
    name: 'Frigate',
    role: 'Line fighter',
    rig: 'Square, 3 masts',
    blurb: 'Three masts carrying topgallants — the tallest rig afloat — and fourteen ' +
      'guns a side behind a hull that can absorb a full broadside. Slow to turn, so it ' +
      'fights by committing to a heading early and making the other ship come to it.',
    length: '27 m',
    crew: 42,
    guns: 28,
    stats: { speed: 3, turn: 3, hull: 4, broadside: 4 },
    geo: {
      len: 27, beam: 7.4, depth: 3.8, draft: 1.8, gunPorts: 14, forecastle: true, mastH: 24.5,
      sterncastle: { decks: 2, height: 0.62 },
      masts: [
        { xFrac: 0.28, heightFrac: 0.84, rig: 'square', tiers: 2, sailW: 1.1, staysail: true },
        { xFrac: 0.0, heightFrac: 1.0, rig: 'square', tiers: 3, sailW: 1.3, staysail: true },
        { xFrac: -0.27, heightFrac: 0.88, rig: 'square', tiers: 2, sailW: 1.05, spanker: true },
      ],
    },
  },

  galleon: {
    id: 'galleon',
    name: 'Galleon',
    role: 'Fortress',
    rig: 'Square + lateen',
    blurb: 'Four masts ending in a lateen mizzen, two full gun decks, a beakhead ' +
      'forward and a stern castle you can see from across the map. Turns like a ' +
      'cathedral; anything that ends up alongside it dies there.',
    length: '34 m',
    crew: 68,
    guns: 44,
    stats: { speed: 2, turn: 1, hull: 5, broadside: 5 },
    geo: {
      // Tubbiest hull (L:B 3.1) with the tallest freeboard, two gun decks,
      // a beakhead forward and a four-deck castle aft.
      len: 34, beam: 11.0, depth: 5.6, draft: 2.4, gunPorts: 22, gunDecks: 2,
      forecastle: true, beakhead: true, mastH: 27,
      sterncastle: { decks: 4, height: 0.66 },
      masts: [
        { xFrac: 0.32, heightFrac: 0.78, rig: 'square', tiers: 2, sailW: 0.9 },
        { xFrac: 0.1, heightFrac: 1.0, rig: 'square', tiers: 3, sailW: 1.15, staysail: true },
        { xFrac: -0.14, heightFrac: 0.9, rig: 'square', tiers: 2, sailW: 1.0 },
        { xFrac: -0.36, heightFrac: 0.68, rig: 'lateen', sailW: 0.8 },
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
