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
import { armedMountFor, type FireMount } from './sim/lookSector.ts';

import { waveHeight, waveNormal } from './sim/waves.ts';
import { normalizeAngle } from './sim/wind.ts';
import { LocalTransport } from './net/local.ts';
import { Interpolator } from './net/interpolator.ts';
import { buildOcean } from './render/ocean.ts';
import { buildSky, createRig } from './render/scene.ts';
import { buildShipMesh } from './render/shipMesh.ts';
import { toBabylonMesh } from './render/toBabylon.ts';
import { KeyboardInput } from './input/keyboard.ts';
import { MouseLook } from './input/mouse.ts';
import { drawRain } from './render/rain.ts';
import { Effects, makeReticle } from './render/effects.ts';
import { renderHud } from './render/hud.ts';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

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
const effects = new Effects(scene);
const reticlePort = makeReticle(scene, '#e2a84f');
const reticleStbd = makeReticle(scene, '#e2a84f');
const input = new KeyboardInput();
input.attach(window);
const mouse = new MouseLook();
mouse.attach(canvas);

/** Currently armed weapon, driven by camera yaw relative to heading. Updated
 *  every render frame (not just on fire) so the HUD can show it live and the
 *  hysteresis has a continuous bearing to stick against. */
let armedMount: FireMount = 'starboard';

/* Immediate local feedback: the muzzle flash answers the keypress, while the
 * authoritative volley is still ~160 ms away. Deliberately no predicted
 * cannonball — a fake ball that then diverges from the server's is more
 * jarring than the delay it would hide. */
mouse.onFirePressed = () => {
  const snap = interp.latest;
  const me = snap?.ships.find((s) => s.id === PLAYER_ID);
  if (!me || me.sinking > 0) return;
  const ready = armedMount === 'port' ? me.reloadPort
    : armedMount === 'starboard' ? me.reloadStbd
      : armedMount === 'bow' ? me.reloadBow
        : me.reloadStern;
  if (ready < 1) return;
  if (armedMount === 'stern') spawnDropSplash(me);
  else spawnMuzzleSmoke(me, armedMount);
};

function spawnMuzzleSmoke(me: ShipState, mount: 'port' | 'starboard' | 'bow'): void {
  const geo = SHIP_CLASSES[me.cls].geo;
  const amp = WEATHER[weather].ocean.amp;
  const isBow = mount === 'bow';
  const guns = isBow ? SHIP_CLASSES[me.cls].combat.bowChasers.guns : SHIP_CLASSES[me.cls].combat.gunsPerSide;
  const puffs = isBow ? guns : Math.min(6, Math.max(3, Math.round(guns / 3)));
  const fireDir = isBow ? me.heading : me.heading + ((mount === 'port' ? -1 : 1) * Math.PI) / 2;

  for (let i = 0; i < puffs; i++) {
    const t = puffs === 1 ? 0.5 : i / (puffs - 1);
    const along = isBow ? geo.len * 0.46 : (t - 0.5) * geo.len * 0.6;
    const lateral = isBow ? (t - 0.5) * geo.beam * 0.5 : geo.beam * 0.6;
    const lateralDir = isBow ? me.heading + Math.PI / 2 : fireDir;
    effects.spawnPuff(
      me.x + Math.sin(me.heading) * along + Math.sin(lateralDir) * lateral,
      waveHeight(me.x, me.z, amp) + geo.depth - geo.draft + 1.0,
      me.z + Math.cos(me.heading) * along + Math.cos(lateralDir) * lateral,
      2.2, 1.1, 2.4,
    );
  }
}

/** Immediate feedback for the stern drop weapon: a small splash where the
 *  charge is about to hit the water, well before the authoritative blast
 *  event arrives. */
function spawnDropSplash(me: ShipState): void {
  const geo = SHIP_CLASSES[me.cls].geo;
  const amp = WEATHER[weather].ocean.amp;
  const astern = me.heading + Math.PI;
  const x = me.x + Math.sin(astern) * geo.len * 0.55;
  const z = me.z + Math.cos(astern) * geo.len * 0.55;
  effects.spawnPuff(x, waveHeight(x, z, amp) + 0.6, z, 1.8, 0.8, 2.0);
}

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

  // A sinking hull settles and rolls over as it goes under.
  const sinkT = s.sinking > 0 ? 1 - s.sinking / (30 * 5) : 0;
  const settle = sinkT * (geo.depth + geo.draft + 2);

  node.mesh.position.set(s.x, surface - geo.draft - settle, s.z);
  node.mesh.rotation.y = s.heading;

  // Lean with the water rather than staying rigidly level.
  const n = waveNormal(s.x, s.z, amp);
  node.mesh.rotation.z = Math.asin(Math.max(-1, Math.min(1, n[0]))) * 0.6 + sinkT * 0.9;
  node.mesh.rotation.x = -Math.asin(Math.max(-1, Math.min(1, n[2]))) * 0.6;
}

/* --- camera: free-look orbit, driven by the mouse ---
 *
 * `view` is world-space (independent of ship heading) — the direction the
 * player is actively looking, which is also what the look-directed weapon
 * select arms off of (see armedMount below). The camera orbits a point just
 * above the ship at a fixed radius; pitch raises or lowers it around that
 * same point rather than just tilting in place, so looking "up" actually
 * swings the camera up toward the rigging instead of just panning the lens.
 */
const camPos = new Vector3(0, 12, -30);

function followCamera(s: ShipState, viewYawDeg: number, pitchDeg: number, amp: number, dt: number): void {
  const geo = SHIP_CLASSES[s.cls].geo;
  const radius = 1.7 * geo.len;
  const baseUp = 0.42 * geo.len;
  const view = viewYawDeg * DEG2RAD;
  const pitch = pitchDeg * DEG2RAD;

  const center = new Vector3(s.x, waveHeight(s.x, s.z, amp) + geo.mastH * 0.22, s.z);
  const flat = radius * Math.cos(pitch);
  const desired = new Vector3(
    center.x - Math.sin(view) * flat,
    center.y + baseUp + radius * Math.sin(pitch),
    center.z - Math.cos(view) * flat,
  );

  const k = Math.min(1, dt * 6);
  camPos.addInPlace(desired.subtract(camPos).scale(k));
  camera.position.copyFrom(camPos);
  camera.setTarget(center);
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
let fireOverride: -1 | 0 | 1 = 0;
let aimOverride: number | null = null;
let cmdAccumulator = 0;
let last = performance.now();
let fpsSamples: number[] = [];
let seq = 0;
/** Heading used to resolve "degrees off the bow" for the next batch of
 *  ticks — updated once per rendered frame from the freshest snapshot, same
 *  one-frame staleness `mouse.onFirePressed` already accepts reading
 *  `interp.latest`. */
let lastHeadingRad = 0;

engine.runRenderLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  // Input is sampled on the simulation's clock, not the render clock, so the
  // command rate does not change with framerate.
  cmdAccumulator += dt * 1000;
  while (cmdAccumulator >= TICK_MS) {
    cmdAccumulator -= TICK_MS;
    const tickDt = TICK_MS / 1000;
    const steer = input.sample(tickDt);
    const look = mouse.sample(tickDt);

    const bearingOffBowDeg = normalizeAngle(look.yawDeg * DEG2RAD - lastHeadingRad) * RAD2DEG;
    armedMount = armedMountFor(bearingOffBowDeg, armedMount);

    let fire: FireMount | null = look.firePending ? armedMount : null;
    if (fireOverride !== 0) { fire = fireOverride < 0 ? 'port' : 'starboard'; fireOverride = 0; }

    transport.sendCommand({
      seq: seq++,
      turn: steer.turn,
      sail: steer.sail,
      fire,
      aimRange: aimOverride ?? steer.aimRange,
      ammo: steer.ammo,
      aimHold: look.aimHold,
    });
  }

  transport.update(now);

  const snap = interp.sample();
  if (snap) {
    const amp = WEATHER[snap.weather].ocean.amp;
    for (const s of snap.ships) syncShip(s, amp);
    effects.syncProjectiles(snap.projectiles);
    consumeEvents(snap, amp);

    const me = snap.ships.find((s) => s.id === PLAYER_ID);
    if (me) {
      lastHeadingRad = me.heading;
      const target = snap.ships.find((s) => s.id !== PLAYER_ID);
      followCamera(me, mouse.yaw, mouse.pitch, amp, dt);
      renderHud(hud, {
        me, target,
        windFrom: snap.windFrom,
        weather: snap.weather,
        aimRange: input.aimRange,
        ammo: input.ammoType,
        latencyMs: transport.latencyMs,
        armedMount,
        camYawWorld: mouse.yaw * DEG2RAD,
        fov: camera.fov,
      });
      updateReticle(me, amp);
    }
  }

  effects.update(dt, camera.position);
  scene.render();

  fpsSamples.push(engine.getFps());
  if (fpsSamples.length > 120) fpsSamples.shift();

  drawRain(overlay, WEATHER[weather].rain, now);
});


/* Snapshot events are transient — they appear in exactly one snapshot. The
 * interpolator can hand back the same snapshot across several frames, so
 * track the last tick consumed rather than replaying the same explosions. */
let lastEventTick = -1;
function consumeEvents(snap: NonNullable<ReturnType<typeof interp.sample>>, amp: number): void {
  if (snap.tick === lastEventTick) return;
  lastEventTick = snap.tick;

  for (const e of snap.events) {
    if (e.kind === 'splash') {
      effects.spawnPuff(e.x, waveHeight(e.x, e.z, amp) + 0.6, e.z, 1.5, 0.7, 3.2);
    } else if (e.kind === 'impact') {
      effects.spawnPuff(e.x, e.y, e.z, 1.8, 0.6, 1.6);
    } else if (e.kind === 'muzzle') {
      // The local ship already flashed on the keypress; this covers everyone else.
      const ship = snap.ships.find((s) => s.id === e.shipId);
      if (ship && ship.id !== PLAYER_ID) {
        if (e.mount === 'stern') spawnDropSplash(ship);
        else spawnMuzzleSmoke(ship, e.mount);
      }
    } else if (e.kind === 'dropBlast') {
      effects.spawnPuff(e.x, waveHeight(e.x, e.z, amp) + 1.0, e.z, 3.0, 1.3, 2.6);
    } else if (e.kind === 'sunk') {
      const ship = snap.ships.find((s) => s.id === e.shipId);
      if (ship) {
        for (let i = 0; i < 5; i++) {
          effects.spawnPuff(ship.x, waveHeight(ship.x, ship.z, amp) + 1 + i, ship.z, 3.5, 1.8, 1.2);
        }
      }
    }
  }
}

/* The reticle marks where a broadside would land: straight off the beam at the
 * chosen range. Range is the only thing the gunner controls — bearing comes
 * from steering the ship, which is the whole point of a fixed battery. */
function updateReticle(me: ShipState, amp: number): void {
  const r = input.aimRange;
  for (const side of [-1, 1] as const) {
    const beam = me.heading + (side * Math.PI) / 2;
    const x = me.x + Math.sin(beam) * r;
    const z = me.z + Math.cos(beam) * r;
    const marker = side < 0 ? reticlePort : reticleStbd;
    marker.position.set(x, waveHeight(x, z, amp) + 0.35, z);
    const ready = side < 0 ? me.reloadPort : me.reloadStbd;
    marker.scaling.setAll(ready >= 1 ? 1 : 0.55);
  }
}

/* Expose a couple of read-only handles so headless verification can measure
 * framerate and drive the demo without scripting the DOM. */
(window as unknown as Record<string, unknown>).__ship = {
  fps: () => (fpsSamples.length ? fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length : 0),
  setWeather,
  setClass: (cls: ShipClassId) => transport.sendControl({ kind: 'setClass', shipId: PLAYER_ID, cls }),
  setLatency: (ms: number) => { transport.latencyMs = ms; },
  snapshot: () => interp.latest,
  /* Verification handles: fire a broadside and read combat state without
   * having to synthesise mouse events. Signature kept as -1|1 (port/
   * starboard) for verify-render.mjs; mapped to a FireMount internally. */
  fire: (side: -1 | 1) => {
    const me = interp.latest?.ships.find((s) => s.id === PLAYER_ID);
    if (me) spawnMuzzleSmoke(me, side < 0 ? 'port' : 'starboard');
    fireOverride = side;
  },
  setAim: (r: number) => { aimOverride = r; },
  /* Park the foe dead abeam of the player (side -1 port / 1 starboard) at
   * `range` metres, stopped and no longer driven by the bot, so a verification
   * broadside has a target in the firing arc. */
  placeFoe: (side: -1 | 1, range: number) => {
    const me = world.ships.find((s) => s.id === PLAYER_ID);
    const foe = world.ships.find((s) => s.id === AI_ID);
    if (!me || !foe) return;
    const beam = me.heading + (side * Math.PI) / 2;
    foe.x = me.x + Math.sin(beam) * range;
    foe.z = me.z + Math.cos(beam) * range;
    foe.heading = me.heading;
    foe.speed = 0;
    foe.bot = undefined;
  },
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
