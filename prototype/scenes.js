/* Shared world settings + scene builders for the mockup pages.
   One palette and one light rig across every render, so the two documents
   read as the same game. */

const SEA = { deep: '#2f97b8', crest: '#7ed6dd' };
const HAZE = '#d8e8f2';

const SKY = { top: '#3f8ad4', mid: '#8bbfe9', horizon: '#dcecf6', cloud: '#ffffff' };

const SUN = {
  dir: [-0.42, 0.68, 0.6],
  color: '#fff4dc',
  skyFill: '#e2eefa',
  groundFill: '#9fb0ab',
  ambient: 0.84,
  strength: 0.48,
  wrap: 0.35,
};

const FOG = { color: HAZE, start: 70, end: 380 };

const PLAYER_SHIP = {
  hull: '#a5662f', hullDark: '#7d4a20', deck: '#d3a05a', stripe: '#e8ddc4',
  cabin: '#8a5527', mast: '#6b4626', sail: '#f4ecd8', sailAlt: '#e8dcc0', flag: '#d9553a',
};

const ENEMY_SHIP = {
  hull: '#404b58', hullDark: '#2c343d', deck: '#78838f', stripe: '#c9d2da',
  cabin: '#39424c', mast: '#282d33', sail: '#eceff2', sailAlt: '#d6dbe1', flag: '#c4402c',
};

const ALLY_SHIP = {
  hull: '#8d5f8f', hullDark: '#6a4570', deck: '#c79ac2', stripe: '#eddcea',
  cabin: '#754a78', mast: '#59394f', sail: '#f6eef4', sailAlt: '#e6d8e4', flag: '#f0b93f',
};

const DEFAULT_CLOUDS = [
  { x: 0.18, y: 0.15, s: 0.12, seed: 3, alpha: 0.9 },
  { x: 0.54, y: 0.09, s: 0.1, seed: 8, alpha: 0.82 },
  { x: 0.84, y: 0.19, s: 0.14, seed: 15, alpha: 0.88 },
];

function baseScene(camera, meshes, clouds) {
  return {
    sky: SKY,
    clouds: clouds || DEFAULT_CLOUDS,
    camera: camera,
    sun: SUN,
    fog: FOG,
    meshes: meshes,
  };
}

function oceanMesh(cells, amp, seed) {
  return { mesh: makeOcean({ halfSize: 420, cells: cells || 34, color: SEA.deep, crest: SEA.crest, seed: seed || 12, amp: amp == null ? 1.1 : amp }) };
}

/* Hero: a single ship under sail with islands hazing out behind it. */
function sceneHero() {
  const m = [oceanMesh(38, 1.1, 12)];
  m.push.apply(m, buildIsland({ pos: [-78, -1, 130], r: 30, h: 13, trees: 5, seed: 9 }));
  m.push.apply(m, buildIsland({ pos: [120, -1, 200], r: 38, h: 17, trees: 5, seed: 21 }));
  m.push.apply(m, buildShip({ pos: [6, -1.45, 24], rotY: 1.45, heel: 0.06, scale: 1.15, palette: PLAYER_SHIP, seed: 4 }));
  return baseScene({ eye: [-19, 11, -5], target: [5, 4.2, 26], fov: 50 }, m);
}

/* Range test A: two ships trading position in open water. */
function sceneChase() {
  const m = [oceanMesh(30, 1.2, 31)];
  m.push.apply(m, buildIsland({ pos: [150, -1, 250], r: 42, h: 19, trees: 4, seed: 33 }));
  m.push.apply(m, buildShip({ pos: [-6, -1.45, 20], rotY: 1.25, heel: 0.1, scale: 1.05, palette: PLAYER_SHIP, seed: 4 }));
  m.push.apply(m, buildShip({ pos: [52, -1.45, 46], rotY: 2.6, heel: -0.05, scale: 1.0, palette: ENEMY_SHIP, seed: 7 }));
  return baseScene({ eye: [-24, 13, -8], target: [16, 4.2, 28], fov: 54 }, m);
}

/* Range test B: a calmer island approach, showing the same rules on land. */
function sceneIsland() {
  const m = [oceanMesh(30, 0.7, 55)];
  m.push.apply(m, buildIsland({ pos: [-46, -1, 74], r: 28, h: 15, trees: 8, seed: 44 }));
  m.push.apply(m, buildIsland({ pos: [100, -1, 165], r: 34, h: 15, trees: 4, seed: 12 }));
  m.push.apply(m, buildShip({ pos: [6, -1.45, 26], rotY: 1.4, heel: 0.03, scale: 1.15, palette: ALLY_SHIP, seed: 9 }));
  return baseScene({ eye: [-20, 10, -2], target: [6, 3.8, 28], fov: 52 }, m);
}

/* The in-combat view: camera behind and above the player's ship, enemy off
   the port bow. This is the framing the HUD is designed around. */
function sceneCombat() {
  const m = [oceanMesh(36, 1.15, 77)];
  m.push.apply(m, buildIsland({ pos: [120, -1, 60], r: 34, h: 15, trees: 5, seed: 61 }));
  m.push.apply(m, buildIsland({ pos: [40, -1, -170], r: 40, h: 18, trees: 4, seed: 71 }));
  m.push.apply(m, buildShip({ pos: [0, -1.45, 0], rotY: 0.3, heel: 0.06, scale: 1.15, palette: PLAYER_SHIP, seed: 4 }));
  m.push.apply(m, buildShip({ pos: [38, -1.45, -34], rotY: 2.45, heel: -0.07, scale: 1.05, palette: ENEMY_SHIP, seed: 7 }));
  return baseScene(
    { eye: [-36, 15, 9], target: [16, 1.6, -6], fov: 48 },
    m,
    [
      { x: 0.24, y: 0.13, s: 0.12, seed: 4, alpha: 0.88 },
      { x: 0.68, y: 0.08, s: 0.11, seed: 9, alpha: 0.8 },
    ]
  );
}

/* Render helper: draws once, and re-draws on resize (debounced). Static by
   design — these are mockups, and a still frame is what gets reviewed. */
function mountScene(canvasId, sceneFactory) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const draw = function () { renderScene(canvas, sceneFactory()); };
  draw();
  let timer = null;
  window.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(draw, 150);
  });
}
