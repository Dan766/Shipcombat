#!/usr/bin/env node
/* Headless render verification.
 *
 * Drives a real browser over CDP (no virtual time — that zeroes frame deltas
 * and makes framerate unmeasurable) and reports, per weather state:
 *   - frame time and framerate
 *   - geometry budget
 *   - that the interpolated world is actually moving
 *
 * IMPORTANT: in CI/containers this runs on SwiftShader, a software
 * rasteriser. Framerate here is a floor, not a prediction of real hardware.
 * Treat the geometry budget as the transferable number.
 *
 * Usage: node scripts/verify-render.mjs [--url http://127.0.0.1:5173] [--shots dir]
 */

import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};

const URL = arg('--url', 'http://127.0.0.1:5173');
const SHOTS = arg('--shots', null);
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const WEATHERS = ['clear', 'fair', 'squall', 'storm', 'fog'];
const CLASSES = ['sloop', 'brig', 'frigate', 'galleon'];

if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--no-sandbox', '--hide-scrollbars',
    '--enable-unsafe-swiftshader',
    '--window-size=1280,720',
  ],
  defaultViewport: { width: 1280, height: 720 },
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('window.__ship && window.__ship.snapshot()', { timeout: 30000 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Measure real frame times by sampling rAF for a fixed wall-clock window. */
async function measure(ms) {
  return page.evaluate(async (dur) => {
    const times = [];
    let last = performance.now();
    const start = last;
    await new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        times.push(now - last);
        last = now;
        if (now - start >= dur) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    return {
      frames: times.length,
      meanMs: mean,
      p95Ms: times[Math.floor(times.length * 0.95)] ?? mean,
      fps: 1000 / mean,
    };
  }, ms);
}

const geom = await page.evaluate(() => ({
  vertices: window.__ship.triangles ? 0 : 0,
}));
void geom;

console.log('renderer: SwiftShader (software) — framerate is a floor, not a hardware prediction\n');
console.log('weather    frames   mean ms   p95 ms     fps   meshes    verts');

let worst = Infinity;
const rows = [];

for (const w of WEATHERS) {
  await page.evaluate((id) => window.__ship.setWeather(id), w);
  await sleep(1200); // let the ocean rebuild and the snapshot settle
  const m = await measure(3000);
  const stats = await page.evaluate(() => ({
    meshes: window.__ship.triangles(),
    verts: window.__ship.vertices ? window.__ship.vertices() : 0,
  }));
  rows.push({ w, ...m, ...stats });
  worst = Math.min(worst, m.fps);
  console.log(
    `${w.padEnd(9)} ${String(m.frames).padStart(6)} ${m.meanMs.toFixed(1).padStart(9)} ` +
    `${m.p95Ms.toFixed(1).padStart(8)} ${m.fps.toFixed(1).padStart(7)} ${String(stats.meshes).padStart(8)} ` +
    `${String(stats.verts).padStart(8)}`,
  );
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/weather-${w}.png` });
}

// Back to a legible condition before the class shots — otherwise they are
// taken in whatever weather the loop above happened to end on.
await page.evaluate(() => window.__ship.setWeather('fair'));
await sleep(1200);

// Every class must build and render without error.
console.log('\nclass switch:');
for (const c of CLASSES) {
  await page.evaluate((id) => window.__ship.setClass(id), c);
  await sleep(900);
  const snap = await page.evaluate(() => window.__ship.snapshot());
  const me = snap.ships.find((s) => s.id === 1);
  console.log(`  ${c.padEnd(9)} rendered, sim class = ${me.cls}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/class-${c}.png` });
}

// Ships must sail bow-first. A sign error in the mesh rotation or the
// heading convention shows up as a ship gliding backwards, which is
// surprisingly easy to miss by eye from directly astern.
console.log('\nheading vs motion:');
{
  const r = await page.evaluate(async () => {
    const read = () => {
      const s = window.__ship.snapshot();
      const me = s.ships.find((x) => x.id === 1);
      return { x: me.x, z: me.z, h: me.heading, speed: me.speed };
    };
    const a = read();
    await new Promise((res) => setTimeout(res, 900));
    const b = read();
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    // Forward for heading h is (sin h, cos h).
    const dot = (dx / len) * Math.sin(b.h) + (dz / len) * Math.cos(b.h);
    return { dot, moved: len, speed: b.speed };
  });
  const ok = r.moved > 0.5 && r.dot > 0.9;
  console.log(`  moved ${r.moved.toFixed(2)} m, heading-motion dot ${r.dot.toFixed(3)} ` +
    `-> ${ok ? 'sails bow-first' : 'WRONG DIRECTION'}`);
  if (!ok) { console.error('FAIL: ship is not travelling along its heading'); await browser.close(); process.exit(1); }
}

// Interpolation must stay smooth as latency changes — the seam that would
// otherwise never be exercised.
console.log('\ninterpolation under latency:');
for (const lat of [0, 80, 150]) {
  await page.evaluate((ms) => window.__ship.setLatency(ms), lat);
  await sleep(1000);
  const motion = await page.evaluate(async () => {
    const samples = [];
    for (let i = 0; i < 30; i++) {
      const s = window.__ship.snapshot();
      const me = s.ships.find((x) => x.id === 1);
      samples.push([me.x, me.z]);
      await new Promise((r) => setTimeout(r, 50));
    }
    const steps = [];
    for (let i = 1; i < samples.length; i++) {
      steps.push(Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]));
    }
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    const max = Math.max(...steps);
    return { mean, max, ratio: mean > 1e-6 ? max / mean : 0 };
  });
  const verdict = motion.ratio < 4 ? 'smooth' : 'JITTERY';
  console.log(`  ${String(lat).padStart(3)} ms  mean step ${motion.mean.toFixed(3)} m  ` +
    `max/mean ${motion.ratio.toFixed(2)}  ${verdict}`);
}

// Combat: fire a broadside and confirm the whole chain works — command out,
// authoritative volley back, projectiles rendered, damage applied.
console.log('\ncombat:');
{
  await page.evaluate(() => window.__ship.setWeather('fair'));
  await page.evaluate(() => window.__ship.setClass('frigate'));
  await sleep(1500);

  const before = await page.evaluate(() => {
    const s = window.__ship.snapshot();
    const foe = s.ships.find((x) => x.id !== 1);
    return { hull: foe.hull, rig: foe.rig };
  });

  await page.evaluate(() => window.__ship.setAim(120));
  await page.evaluate(() => window.__ship.placeFoe(1, 120));
  await sleep(300);
  let maxInFlight = 0;
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.__ship.fire(1));
    for (let j = 0; j < 10; j++) {
      await sleep(110);
      const n = await page.evaluate(() => window.__ship.snapshot().projectiles.length);
      maxInFlight = Math.max(maxInFlight, n);
    }
  }
  console.log(`  projectiles rendered in flight: peak ${maxInFlight}`);
  if (maxInFlight === 0) {
    console.error('FAIL: firing produced no projectiles');
    await browser.close();
    process.exit(1);
  }

  const after = await page.evaluate(() => {
    const s = window.__ship.snapshot();
    const foe = s.ships.find((x) => x.id !== 1);
    return { hull: foe.hull, rig: foe.rig };
  });
  const damaged = after.hull < before.hull || after.rig < before.rig;
  console.log(`  enemy hull ${before.hull.toFixed(2)} -> ${after.hull.toFixed(2)}, ` +
    `rig ${before.rig.toFixed(2)} -> ${after.rig.toFixed(2)}  ` +
    `${damaged ? '(foe parked abeam took damage)' : '(no damage landed)'}`);

  if (!damaged) {
    console.error('FAIL: broadsides at a foe parked 120 m abeam landed no damage');
    await browser.close();
    process.exit(1);
  }

  if (SHOTS) await page.screenshot({ path: `${SHOTS}/combat.png` });
}

if (errors.length) {
  console.error('\nFAIL: page errors\n  ' + errors.slice(0, 5).join('\n  '));
  await browser.close();
  process.exit(1);
}

console.log(`\nworst-case software framerate: ${worst.toFixed(1)} fps`);
await browser.close();
