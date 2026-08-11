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

function baseScene(camera, meshes, clouds, fog) {
  return {
    sky: SKY,
    clouds: clouds || DEFAULT_CLOUDS,
    camera: camera,
    sun: SUN,
    // Overridable: the class lineup shoots from far enough away that the
    // default haze would flatten every ship into the horizon color.
    fog: fog || FOG,
    meshes: meshes,
  };
}

function oceanMesh(cells, amp, seed) {
  return { mesh: makeOcean({ halfSize: 420, cells: cells || 34, color: SEA.deep, crest: SEA.crest, seed: seed || 12, amp: amp == null ? 1.1 : amp }) };
}

// Ocean built to a weather preset's sea state rather than the default one.
function weatherOcean(w, cells, seed) {
  // Size the sheet to what the weather actually lets you see. In a storm the
  // haze closes in at 150m, so a 420m sheet spends most of its resolution on
  // water nobody can see — shrinking it puts finer facets where they show.
  const reach = Math.min(420, Math.max(80, w.fog.end * 1.25));
  return {
    mesh: makeOcean({
      halfSize: reach, cells: cells || 32, seed: seed || 12,
      color: w.ocean.deep, crest: w.ocean.crest, amp: w.ocean.amp,
      foamStart: w.ocean.foamStart == null ? null : w.ocean.foamStart * w.ocean.amp,
    }),
  };
}

// A scene lit and dressed entirely by a weather preset.
function weatherScene(w, camera, meshes) {
  return {
    sky: w.sky,
    clouds: w.clouds,
    camera: camera,
    sun: w.sun,
    fog: w.fog,
    rain: w.rain,
    meshes: meshes,
  };
}

/* Hero: a single ship under sail with islands hazing out behind it. */
function sceneHero() {
  const m = [oceanMesh(38, 1.1, 12)];
  m.push.apply(m, buildIsland({ pos: [-78, -1, 130], r: 30, h: 13, trees: 5, seed: 9 }));
  m.push.apply(m, buildIsland({ pos: [120, -1, 200], r: 38, h: 17, trees: 5, seed: 21 }));
  m.push.apply(m, buildClassShip('brig', { pos: [6, null, 24], rotY: 1.45, heel: 0.06, palette: PLAYER_SHIP, seed: 4 }));
  return baseScene({ eye: [-21, 11.5, -6], target: [5, 5.4, 26], fov: 50 }, m);
}

/* Range test A: two ships trading position in open water. */
function sceneChase() {
  const m = [oceanMesh(30, 1.2, 31)];
  m.push.apply(m, buildIsland({ pos: [150, -1, 250], r: 42, h: 19, trees: 4, seed: 33 }));
  // Sloop against Frigate: the readability claim in the caption is only
  // worth making if the two ships are genuinely different classes.
  m.push.apply(m, buildClassShip('sloop', { pos: [-6, null, 20], rotY: 1.25, heel: 0.1, palette: PLAYER_SHIP, seed: 4 }));
  m.push.apply(m, buildClassShip('frigate', { pos: [54, null, 48], rotY: 2.6, heel: -0.05, palette: ENEMY_SHIP, seed: 7 }));
  return baseScene({ eye: [-24, 13, -8], target: [16, 4.2, 28], fov: 54 }, m);
}

/* Range test B: a calmer island approach, showing the same rules on land. */
function sceneIsland() {
  const m = [oceanMesh(30, 0.7, 55)];
  m.push.apply(m, buildIsland({ pos: [-46, -1, 74], r: 28, h: 15, trees: 8, seed: 44 }));
  m.push.apply(m, buildIsland({ pos: [100, -1, 165], r: 34, h: 15, trees: 4, seed: 12 }));
  m.push.apply(m, buildClassShip('galleon', { pos: [8, null, 30], rotY: 1.4, heel: 0.03, palette: ALLY_SHIP, seed: 9 }));
  return baseScene({ eye: [-24, 13, -4], target: [7, 7.5, 31], fov: 52 }, m);
}

/* The in-combat view: camera behind and above the player's ship, enemy off
   the port bow. This is the framing the HUD is designed around. */
function sceneCombat() {
  const m = [oceanMesh(36, 1.15, 77)];
  m.push.apply(m, buildIsland({ pos: [120, -1, 60], r: 34, h: 15, trees: 5, seed: 61 }));
  m.push.apply(m, buildIsland({ pos: [40, -1, -170], r: 40, h: 18, trees: 4, seed: 71 }));
  // The HUD labels these "Sea Wolf — Sloop" and "Iron Gull — Frigate", so
  // they are built from those actual classes.
  m.push.apply(m, buildClassShip('sloop', { pos: [0, null, 0], rotY: 0.3, heel: 0.06, scale: 1.15, palette: PLAYER_SHIP, seed: 4 }));
  m.push.apply(m, buildClassShip('frigate', { pos: [42, null, -38], rotY: 2.45, heel: -0.07, scale: 1.0, palette: ENEMY_SHIP, seed: 7 }));
  return baseScene(
    { eye: [-36, 15, 9], target: [16, 1.6, -6], fov: 48 },
    m,
    [
      { x: 0.24, y: 0.13, s: 0.12, seed: 4, alpha: 0.88 },
      { x: 0.68, y: 0.08, s: 0.11, seed: 9, alpha: 0.8 },
    ]
  );
}

/* --- class roster scenes --- */

// All four classes broadside-on along one waterline at true relative scale.
// Shot from far away through a narrow lens to approximate an orthographic
// view, so the size comparison is honest rather than perspective-skewed.
function sceneClassLineup() {
  const m = [oceanMesh(26, 0.5, 91)];
  // Laid out along z with gaps proportional to hull length. Turned ~32 degrees
  // off broadside rather than square to the camera: dead broadside puts every
  // square sail edge-on and would undersell three of the four rigs. All four
  // rotate by the same amount, so the size comparison stays honest — each
  // keeps ~85% of its length while showing ~52% of its sail area.
  const LINEUP_ROT = Math.PI / 2 + 0.56;
  let z = -52;
  SHIP_CLASS_ORDER.forEach(function (id, i) {
    const geo = SHIP_CLASSES[id].geo;
    z += geo.len * 0.62;
    m.push.apply(m, buildClassShip(id, {
      pos: [0, null, z], rotY: LINEUP_ROT, heel: 0, palette: PLAYER_SHIP, seed: 4 + i,
    }));
    z += geo.len * 0.62;
  });
  return baseScene(
    { eye: [-300, 17, 4], target: [0, 12, 4], fov: 9 },
    m,
    [{ x: 0.2, y: 0.16, s: 0.1, seed: 3, alpha: 0.7 }, { x: 0.78, y: 0.12, s: 0.11, seed: 9, alpha: 0.65 }],
    { color: HAZE, start: 260, end: 540 }
  );
}

// One class, three-quarter view, framed so each fills its card similarly
// despite the roster spanning a 2x size range.
function sceneClassPortrait(classId) {
  const geo = SHIP_CLASSES[classId].geo;
  const m = [oceanMesh(22, 0.8, 40 + geo.len)];
  m.push.apply(m, buildClassShip(classId, {
    pos: [0, null, 0], rotY: 1.42, heel: 0.05, palette: PLAYER_SHIP, seed: 4,
  }));
  // Framing is derived from the rig's real height rather than tuned per class:
  // masthead height varies independently of hull length (the sloop is short
  // but rig-tall, the galleon long and comparatively squat), so any
  // length-based guess clips one class while wasting space on another.
  const FOV = 50;
  const mastTop = geo.depth + (geo.mastH || geo.len * 0.8);
  const topY = mastTop - geo.draft;
  const midY = topY * 0.5;
  const halfNeed = midY + 1.5;
  const dist = halfNeed / (Math.tan((FOV / 2) * Math.PI / 180) * 0.8);
  const dir = vnorm([0.935, -0.191, 0.297]);
  const target = [geo.len * 0.1875, midY, geo.len * 0.1125];
  return baseScene(
    {
      eye: [target[0] - dir[0] * dist, target[1] - dir[1] * dist, target[2] - dir[2] * dist],
      target: target,
      fov: FOV,
    },
    m,
    [{ x: 0.22, y: 0.14, s: 0.11, seed: 6, alpha: 0.8 }, { x: 0.76, y: 0.2, s: 0.12, seed: 12, alpha: 0.75 }],
    { color: HAZE, start: 90, end: 420 }
  );
}

// Readability test: flat near-black hull against a pale ground, no ocean and
// no haze. If the four are not tellable apart here, the silhouettes are not
// doing their job at minimap size.
const SILHOUETTE_PALETTE = (function () {
  const ink = '#16232b';
  return {
    hull: ink, hullDark: ink, deck: ink, stripe: ink, cabin: ink,
    mast: ink, sail: ink, sailAlt: ink, flag: ink, gunPort: ink,
  };
})();

function sceneClassSilhouette(classId) {
  const geo = SHIP_CLASSES[classId].geo;
  // No sea here, so the waterline clip is disabled — otherwise the hull
  // would be sliced off with nothing to hide the cut.
  const m = buildClassShip(classId, {
    // ~55 degrees off the camera axis. Dead-on foreshortens the hull length
    // away; full broadside turns the square sails edge-on. This angle keeps
    // roughly 80% of the length and 58% of the sail area — both cues legible.
    pos: [0, 0, 0], rotY: 0.7, heel: 0, clipBelow: -999,
    palette: SILHOUETTE_PALETTE, seed: 4,
  });
  // Rigs carry explicit heights now, so frame from the actual mast top and
  // from hull length — whichever is the binding dimension for this class.
  const mastTop = geo.depth + (geo.mastH || geo.len * 0.8);
  const size = Math.max(mastTop, geo.len * 0.95);
  const flat = { top: '#dfeaf1', mid: '#dfeaf1', horizon: '#dfeaf1', cloud: '#dfeaf1' };
  const scene = baseScene(
    // Three-quarter view: dead broadside would put the square sails edge-on
    // and collapse them to lines. This is also closer to how a ship actually
    // presents itself at distance in play.
    {
      eye: [-2.2 * size, 0.92 * size, -0.58 * size],
      target: [0, 0.46 * mastTop, 0],
      fov: 38,
    },
    m,
    [],
    { color: '#dfeaf1', start: 9000, end: 10000 }
  );
  scene.sky = flat;
  // Flat ambient only — a silhouette should carry no shading information.
  scene.sun = { dir: [0, 1, 0], color: '#000000', skyFill: '#ffffff', groundFill: '#ffffff', ambient: 1, strength: 0, wrap: 1 };
  return scene;
}

/* --- weather scenes --- */

// The identical shot under each weather preset: same camera, same brig, same
// seed. Only the atmosphere and the sea state change, so any difference you
// see between these is the weather and nothing else.
function sceneWeather(weatherId) {
  const w = WEATHER[weatherId];
  const m = [weatherOcean(w, 40, 64)];
  // Land is included so the visibility difference has something to act on —
  // in fog these vanish completely, which is the whole point of the state.
  m.push.apply(m, buildIsland({ pos: [-64, -1, 108], r: 28, h: 14, trees: 6, seed: 9 }));
  m.push.apply(m, buildIsland({ pos: [96, -1, 168], r: 34, h: 16, trees: 4, seed: 21 }));
  m.push.apply(m, buildClassShip('brig', {
    pos: [4, null, 24], rotY: 1.42, heel: w.heel, palette: PLAYER_SHIP, seed: 4,
  }));
  return weatherScene(w, { eye: [-21, 10.5, -4], target: [4, 5.2, 26], fov: 52 }, m);
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
