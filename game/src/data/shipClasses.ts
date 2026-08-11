/* Ship class roster — the source of truth.
 *
 * `geo` drives mesh construction, `sail` drives the simulation, and the
 * display fields are UI copy. Keeping all three in one record is what stops
 * the renders from disagreeing with the numbers shown beside them.
 *
 * The copies in `prototype/shipclasses.js` are a frozen art reference and are
 * no longer maintained — change values here.
 *
 * MUST NOT import Babylon: the simulation reads this table.
 */

export type ShipClassId = 'sloop' | 'brig' | 'frigate' | 'galleon';

export type RigKind = 'square' | 'foreaft' | 'lateen';

export interface MastDef {
  xFrac: number;
  heightFrac: number;
  rig: RigKind;
  sailW: number;
  tiers?: number;
  spanker?: boolean;
  staysail?: boolean;
}

export interface HullGeo {
  len: number;
  beam: number;
  depth: number;
  draft: number;
  mastH: number;
  gunPorts: number;
  gunDecks?: number;
  forecastle?: boolean;
  beakhead?: boolean;
  sterncastle: { decks: number; height: number };
  masts: MastDef[];
}

/** Sailing characteristics. Starting points for tuning, not balance claims. */
export interface SailDef {
  /** Top speed in m/s on a beam reach in a steady breeze. */
  baseSpeed: number;
  /** Degrees per second at low speed; scaled down as speed rises. */
  turnRate: number;
  /** How quickly speed chases its target, in m/s^2. Heavier ships lag more. */
  accel: number;
}

/** Gunnery and durability. Starting points for tuning, not balance claims. */
export interface CombatDef {
  /** Guns on each side; a volley fires all of them. */
  gunsPerSide: number;
  /** Seconds to reload one side. */
  reloadSec: number;
  /** Hull hit points. */
  hullHp: number;
  /** Rigging hit points. */
  rigHp: number;
}

export interface ShipClass {
  id: ShipClassId;
  name: string;
  role: string;
  rig: string;
  blurb: string;
  length: string;
  crew: number;
  guns: number;
  stats: { speed: number; turn: number; hull: number; broadside: number };
  sail: SailDef;
  combat: CombatDef;
  geo: HullGeo;
}

export const SHIP_CLASSES: Record<ShipClassId, ShipClass> = {
  sloop: {
    id: 'sloop',
    name: 'Sloop',
    role: 'Skirmisher',
    rig: 'Fore-and-aft',
    blurb:
      'The only fore-and-aft rig in the roster — one tall mainsail and a jib, no square canvas at all.',
    length: '16 m',
    crew: 12,
    guns: 8,
    stats: { speed: 5, turn: 5, hull: 2, broadside: 2 },
    sail: { baseSpeed: 9.0, turnRate: 45, accel: 2.6 },
    combat: { gunsPerSide: 4, reloadSec: 4.5, hullHp: 90, rigHp: 60 },
    geo: {
      len: 16, beam: 4.1, depth: 2.5, draft: 1.15, gunPorts: 4, mastH: 15.4,
      sterncastle: { decks: 1, height: 0.5 },
      masts: [{ xFrac: 0.06, heightFrac: 1.0, rig: 'foreaft', sailW: 1.6 }],
    },
  },

  brig: {
    id: 'brig',
    name: 'Brig',
    role: 'All-rounder',
    rig: 'Square, 2 masts',
    blurb: 'Two square-rigged masts and a spanker aft. The default pick.',
    length: '21 m',
    crew: 24,
    guns: 16,
    stats: { speed: 4, turn: 4, hull: 3, broadside: 3 },
    sail: { baseSpeed: 8.0, turnRate: 34, accel: 2.0 },
    combat: { gunsPerSide: 8, reloadSec: 5.5, hullHp: 150, rigHp: 95 },
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
    blurb: 'Three masts carrying topgallants — the tallest rig afloat.',
    length: '27 m',
    crew: 42,
    guns: 28,
    stats: { speed: 3, turn: 3, hull: 4, broadside: 4 },
    sail: { baseSpeed: 7.0, turnRate: 25, accel: 1.5 },
    combat: { gunsPerSide: 14, reloadSec: 7.0, hullHp: 230, rigHp: 140 },
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
    blurb: 'Four masts ending in a lateen mizzen, two full gun decks, a beakhead forward.',
    length: '34 m',
    crew: 68,
    guns: 44,
    stats: { speed: 2, turn: 1, hull: 5, broadside: 5 },
    sail: { baseSpeed: 5.5, turnRate: 16, accel: 1.0 },
    combat: { gunsPerSide: 22, reloadSec: 9.0, hullHp: 340, rigHp: 200 },
    geo: {
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

export const SHIP_CLASS_ORDER: ShipClassId[] = ['sloop', 'brig', 'frigate', 'galleon'];

export interface HullPalette {
  hull: string; hullDark: string; deck: string; stripe: string;
  cabin: string; mast: string; sail: string; sailAlt: string; flag: string;
  gunPort?: string;
}

export const PLAYER_PALETTE: HullPalette = {
  hull: '#a5662f', hullDark: '#7d4a20', deck: '#d3a05a', stripe: '#e8ddc4',
  cabin: '#8a5527', mast: '#6b4626', sail: '#f4ecd8', sailAlt: '#e8dcc0', flag: '#d9553a',
};

export const ENEMY_PALETTE: HullPalette = {
  hull: '#404b58', hullDark: '#2c343d', deck: '#78838f', stripe: '#c9d2da',
  cabin: '#39424c', mast: '#282d33', sail: '#eceff2', sailAlt: '#d6dbe1', flag: '#c4402c',
};
