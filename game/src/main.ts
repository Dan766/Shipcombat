/* Wiring.
 *
 * The loop deliberately reads: sample input -> send over transport ->
 * transport advances the authoritative sim -> snapshot arrives -> interpolate
 * -> draw. Nothing here reaches into world state directly, even though the
 * world happens to be in the same process today.
 */

import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh as BabylonMesh } from '@babylonjs/core/Meshes/mesh';

import { SHIP_CLASSES, SHIP_CLASS_ORDER, ENEMY_PALETTE, PLAYER_PALETTE, type ShipClassId } from './data/shipClasses.ts';
import { WEATHER, WEATHER_ORDER, type WeatherId } from './data/weather.ts';
import { World } from './sim/world.ts';
import { TICK_MS, type ShipState } from './sim/types.ts';
import { angleOffWind, pointOfSailName } from './sim/wind.ts';
import { waveHeight, waveNormal } from './sim/waves.ts';
import { LocalTransport } from './net/local.ts';
import { Interpolator } from './net/interpolator.ts';
import { buildOcean } from './render/ocean.ts';
import { buildSky, createRig } from './render/scene.ts';
import { buildShipMesh } from './render/shipMesh.ts';
import { toBabylonMesh } from './render/toBabylon.ts';
import { KeyboardInput } from './input/keyboard.ts';
import { drawRain } from './render/rain.ts';

const PLAYER_ID = 1;
const AI_ID = 2;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;

const rig = createRig(canvas);
const { scene, engine, camera } = rig;

/* --- server side (in-process for now) --- */
const world = new World({ weather: 'fair', windFrom: Math.PI * 0.25 });
world.addShip(PLAYER_ID, 'brig', 0, 0, 0);
world.addShip(AI_ID, 'frigate', 70, 60, Math.PI * 0.8, true);

const transport = new LocalTransport({ world, localShipId: PLAYER_ID, latencyMs: 80 });
const interp = new Interpolator(140);
transport.onSnapshot((s) => interp.push(s));

/* --- client side --- */
const input = new KeyboardInput();
input.attach(window);

let weather: WeatherId = 'fair';
let ocean = buildOcean(WEATHER[weather], scene);
ocean.material = rig.worldMat;
let sky = buildSky(WEATHER[weather], scene, rig.skyMat);
rig.applyWeather(WEATHER[weather]);

/** One prebuilt mesh per class per palette; ships swap which one they show. */
const meshCache = new Map<string, BabylonMesh>();
function getShipMesh(cls: ShipClassId, enemy: boolean): BabylonMesh {
  const key = `${cls}:${enemy ? 'e' : 'p'}`;
  let m = meshCache.get(key);
  if (!m) {
    m = toBabylonMesh(
      buildShipMesh(SHIP_CLASSES[cls], enemy ? ENEMY_PALETTE : PLAYER_PALETTE),
      key, scene,
    );
    m.material = rig.worldMat;
    m.isPickable = false;
    m.setEnabled(false);
    meshCache.set(key, m);
  }
  return m;
}

const shipNodes = new Map<number, { mesh: BabylonMesh; key: string }>();

function syncShip(s: ShipState, amp: number): void {
  const enemy = s.id !== PLAYER_ID;
  const key = `${s.cls}:${enemy ? 'e' : 'p'}`;
  let node = shipNodes.get(s.id);

  if (!node || node.key !== key) {
    node?.mesh.dispose();
    const proto = getShipMesh(s.cls, enemy);
    const inst = proto.clone(`ship${s.id}`);
    inst.setEnabled(true);
    node = { mesh: inst, key };
    shipNodes.set(s.id, node);
  }

  const geo = SHIP_CLASSES[s.cls].geo;
  const surface = waveHeight(s.x, s.z, amp);
  node.mesh.position.set(s.x, surface - geo.draft, s.z);
  node.mesh.rotation.y = s.heading;

  // Lean with the water rather than staying rigidly level.
  const n = waveNormal(s.x, s.z, amp);
  node.mesh.rotation.z = Math.asin(Math.max(-1, Math.min(1, n[0]))) * 0.6;
  node.mesh.rotation.x = -Math.asin(Math.max(-1, Math.min(1, n[2]))) * 0.6;
}

/* --- camera: third person, behind and above --- */
const camPos = new Vector3(0, 12, -30);
function followCamera(s: ShipState, amp: number, dt: number): void {
  const geo = SHIP_CLASSES[s.cls].geo;
  const back = 1.9 * geo.len;
  const up = 0.5 * geo.len;
  // Slight offset to one quarter rather than dead astern: from directly
  // behind, a ship's own sails hide its rig and its length reads as nothing.
  const side = 0.42 * geo.len;
  const right = { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
  const desired = new Vector3(
    s.x - Math.sin(s.heading) * back + right.x * side,
    waveHeight(s.x, s.z, amp) + up,
    s.z - Math.cos(s.heading) * back + right.z * side,
  );
  // Critically-damped-ish follow so the camera lags the ship a little.
  const k = Math.min(1, dt * 3.5);
  camPos.addInPlace(desired.subtract(camPos).scale(k));
  camera.position.copyFrom(camPos);
  camera.setTarget(new Vector3(s.x, waveHeight(s.x, s.z, amp) + geo.mastH * 0.22, s.z));
}

/* --- weather / class switching (debug affordances) --- */
function setWeather(id: WeatherId): void {
  weather = id;
  transport.sendControl({ kind: 'setWeather', weather: id });
  ocean.dispose();
  ocean = buildOcean(WEATHER[id], scene);
  ocean.material = rig.worldMat;
  sky.dispose();
  sky = buildSky(WEATHER[id], scene, rig.skyMat);
  rig.applyWeather(WEATHER[id]);
}

let playerClassIdx = 1;
input.onHotkey = (k) => {
  if ('12345'.includes(k)) {
    setWeather(WEATHER_ORDER[Number(k) - 1]);
  } else if (k === 'c') {
    playerClassIdx = (playerClassIdx + 1) % SHIP_CLASS_ORDER.length;
    transport.sendControl({ kind: 'setClass', shipId: PLAYER_ID, cls: SHIP_CLASS_ORDER[playerClassIdx] });
  } else if (k === 'v') {
    transport.latencyMs = transport.latencyMs === 0 ? 80 : transport.latencyMs === 80 ? 150 : 0;
  }
};

/* --- loop --- */
let cmdAccumulator = 0;
let last = performance.now();
let fpsSamples: number[] = [];

engine.runRenderLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  // Input is sampled on the simulation's clock, not the render clock, so the
  // command rate does not change with framerate.
  cmdAccumulator += dt * 1000;
  while (cmdAccumulator >= TICK_MS) {
    cmdAccumulator -= TICK_MS;
    transport.sendCommand(input.sample(TICK_MS / 1000));
  }

  transport.update(now);

  const snap = interp.sample();
  if (snap) {
    const amp = WEATHER[snap.weather].ocean.amp;
    for (const s of snap.ships) syncShip(s, amp);
    const me = snap.ships.find((s) => s.id === PLAYER_ID);
    if (me) {
      followCamera(me, amp, dt);
      updateHud(me, snap.windFrom);
    }
  }

  scene.render();

  fpsSamples.push(engine.getFps());
  if (fpsSamples.length > 120) fpsSamples.shift();

  drawRain(overlay, WEATHER[weather].rain, now);
});

function updateHud(me: ShipState, windFrom: number): void {
  const cls = SHIP_CLASSES[me.cls];
  const off = angleOffWind(me.heading, windFrom);
  const knots = me.speed * 1.94384;
  hud.innerHTML = `
    <div class="row"><b>${cls.name}</b><span>${cls.rig}</span></div>
    <div class="row"><span>Speed</span><b>${knots.toFixed(1)} kn</b></div>
    <div class="row"><span>Point of sail</span><b>${pointOfSailName(off)}</b></div>
    <div class="row"><span>Sail</span><b>${Math.round(me.sail * 100)}%</b></div>
    <div class="row"><span>Weather</span><b>${WEATHER[weather].name}</b></div>
    <div class="row"><span>Latency</span><b>${transport.latencyMs} ms</b></div>
    <div class="keys">A/D steer &middot; W/S sail &middot; C class &middot; 1-5 weather &middot; V latency</div>`;
}

/* Expose a couple of read-only handles so headless verification can measure
 * framerate and drive the demo without scripting the DOM. */
(window as unknown as Record<string, unknown>).__ship = {
  fps: () => (fpsSamples.length ? fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length : 0),
  setWeather,
  setClass: (cls: ShipClassId) => transport.sendControl({ kind: 'setClass', shipId: PLAYER_ID, cls }),
  setLatency: (ms: number) => { transport.latencyMs = ms; },
  snapshot: () => interp.latest,
  triangles: () => scene.getActiveMeshes().length,
  vertices: () => scene.getTotalVertices(),
};

function fitCanvases(): void {
  engine.resize();
  overlay.width = overlay.clientWidth;
  overlay.height = overlay.clientHeight;
}
window.addEventListener('resize', fitCanvases);
fitCanvases();
// The first fit can run before layout has settled, which leaves the render
// target short of the viewport. Re-fit once a frame has been through.
requestAnimationFrame(fitCanvases);

/* Framerate probe for headless verification: `?fps` logs a rolling average.
 * This is the measurement the whole slice exists to take. */
if (location.search.includes('fps')) {
  let reported = 0;
  setInterval(() => {
    const avg = fpsSamples.length ? fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length : 0;
    console.log(`FPSREPORT n=${++reported} fps=${avg.toFixed(1)} meshes=${scene.getActiveMeshes().length} ` +
      `tris=${scene.getTotalVertices()} weather=${weather}`);
  }, 2000);
}
