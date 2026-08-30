#!/usr/bin/env node
/* Headless verification for prototype/controls.html — the look-directed
 * camera & control scheme mockup.
 *
 * Two independent checks, per the plan this page was built against:
 *   1. Arithmetic — LOOK_ARCS (scenes.js) tiles 360 deg with no gap or
 *      overlap, and the hysteresis band never leaves a bearing with zero or
 *      three-plus stable armed sectors (the flicker / dead-zone bugs this
 *      kind of arc math silently produces).
 *   2. Pixel — every look-sector and specialty canvas actually rendered,
 *      and the player hull + sails are visibly present rather than
 *      edge-on-vanished, which is the framing trap prototype/README.md
 *      documents (broadside views turn square sails edge-on; bow/stern-on
 *      views foreshorten the hull away). Measured, not eyeballed.
 *
 * IMPORTANT: like verify-render.mjs, this runs on SwiftShader / whatever
 * Chrome is available locally — it is checking pixels, not framerate, so
 * that does not matter here the way it does there.
 *
 * Usage: node scripts/verify-controls-mockup.mjs [--shots dir]
 */

import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(HERE, '../../prototype/controls.html');
const SHOTS = arg('--shots', null);

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', // CI / containers
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}
const CHROME = findChrome();

if (!existsSync(PAGE)) {
  console.error(`FAIL: ${PAGE} does not exist — run "python3 prototype/build.py" first.`);
  process.exit(1);
}
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--window-size=1280,1600'],
  defaultViewport: { width: 1280, height: 1600, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('file://' + PAGE.replace(/\\/g, '/'), { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction('window.LOOK_ARCS && window.armedSectorFor', { timeout: 10000 });
// Static mockup renders are drawn on mount; give layout a beat to settle
// before measuring canvas sizes (the frame's aspect-ratio box needs a paint).
await new Promise((r) => setTimeout(r, 300));

console.log('renderer: SwiftShader/whatever Chrome is local -- checking pixels, not framerate\n');

/* ---------- 1. arc tiling ---------- */
console.log('--- LOOK_ARCS tiling ---');
const tiling = await page.evaluate(() => {
  const arcs = window.LOOK_ARCS.slice().sort((a, b) => a.from - b.from);
  let total = 0;
  let ok = true;
  const detail = [];
  for (let i = 0; i < arcs.length; i++) {
    const width = arcs[i].to - arcs[i].from;
    total += width;
    const next = arcs[(i + 1) % arcs.length];
    const nextFrom = i === arcs.length - 1 ? next.from + 360 : next.from;
    const gap = nextFrom - arcs[i].to;
    detail.push({ id: arcs[i].id, from: arcs[i].from, to: arcs[i].to, width, gapToNext: gap });
    if (Math.abs(gap) > 1e-9) ok = false;
  }
  if (Math.abs(total - 360) > 1e-9) ok = false;
  return { ok, total, detail };
});
for (const d of tiling.detail) {
  console.log(`  ${d.id.padEnd(10)} ${String(d.from).padStart(5)} to ${String(d.to).padEnd(5)} (${d.width} deg)  gap to next: ${d.gapToNext}`);
}
if (!tiling.ok) {
  console.error(`FAIL: LOOK_ARCS does not tile 360 deg with no gap/overlap (total=${tiling.total})`);
  await browser.close();
  process.exit(1);
}
console.log(`OK: tiles 360 deg exactly (total=${tiling.total})\n`);

/* ---------- 2. hysteresis: never zero, never 3+, adjacency only ---------- */
console.log('--- hysteresis sweep (-180..180 deg, 0.25 deg steps) ---');
const hyst = await page.evaluate(() => {
  const bad = [];
  const ids = window.LOOK_ARCS.map((a) => a.id);
  const byId = Object.fromEntries(window.LOOK_ARCS.map((a) => [a.id, a]));
  const adjacent = (a, b) => {
    const arcA = byId[a], arcB = byId[b];
    const close = (x, y) => Math.abs(x - y) < 1e-6;
    return close(arcA.to, arcB.from) || close(arcB.to, arcA.from)
      || close(arcA.to - 360, arcB.from) || close(arcB.to - 360, arcA.from);
  };
  for (let b = -180; b <= 180; b += 0.25) {
    const stable = ids.filter((id) => window.armedSectorFor(b, id) === id);
    if (stable.length === 0 || stable.length > 2) {
      bad.push({ bearing: b, stable, reason: stable.length === 0 ? 'no stable sector' : 'three-way ambiguity' });
    } else if (stable.length === 2 && !adjacent(stable[0], stable[1])) {
      bad.push({ bearing: b, stable, reason: 'non-adjacent overlap' });
    }
    // Coverage with no prior state must always resolve to exactly one sector.
    const fresh = window.armedSectorFor(b, null);
    if (!ids.includes(fresh)) bad.push({ bearing: b, fresh, reason: 'uncovered bearing' });
  }
  return bad;
});
if (hyst.length) {
  console.error(`FAIL: ${hyst.length} bearings failed the hysteresis invariant:`);
  console.error(JSON.stringify(hyst.slice(0, 10), null, 2));
  await browser.close();
  process.exit(1);
}
console.log('OK: every bearing resolves to 1 or 2 (adjacent-only) stable sectors, never 0 or 3+\n');

/* ---------- 3. pixel: canvases rendered, hull + sails visible ---------- */
async function measureCanvas(id) {
  return page.evaluate((canvasId) => {
    const c = document.getElementById(canvasId);
    if (!c || !c.width || !c.height) return null;
    const ctx = c.getContext('2d');
    const { width, height } = c;
    const data = ctx.getImageData(0, 0, width, height).data;
    let hull = 0, sail = 0, sample = 0;
    for (let i = 0; i < data.length; i += 4 * 3) { // sample every 3rd pixel
      const r = data[i], g = data[i + 1], b = data[i + 2];
      sample++;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const light = (max + min) / 2 / 255;
      const delta = (max - min) / 255;
      let hue = 0;
      if (delta > 0.001) {
        if (max === r) hue = 60 * (((g - b) / 255 / delta) % 6);
        else if (max === g) hue = 60 * ((b - r) / 255 / delta + 2);
        else hue = 60 * ((r - g) / 255 / delta + 4);
        if (hue < 0) hue += 360;
      }
      const sat = light > 0 && light < 1 ? delta / (1 - Math.abs(2 * light - 1)) : 0;
      // Hull/deck/cabin: warm brown-orange band.
      if (hue >= 10 && hue <= 50 && sat > 0.2 && light > 0.1 && light < 0.65) hull++;
      // Sail/sailAlt/stripe: pale warm cream, low saturation, high lightness.
      else if (light > 0.7 && sat < 0.5 && hue >= 10 && hue <= 60) sail++;
    }
    return { width, height, hullFrac: hull / sample, sailFrac: sail / sample };
  }, id);
}

const CANVASES = [
  { id: 'scene-look-bow', minHull: 0.01, minSail: 0.003 },
  { id: 'scene-look-starboard', minHull: 0.01, minSail: 0.003 },
  { id: 'scene-look-stern', minHull: 0.01, minSail: 0.003 },
  { id: 'scene-look-port', minHull: 0.01, minSail: 0.003 },
  { id: 'scene-mortar', minHull: 0.002, minSail: 0 },
  { id: 'scene-swivel', minHull: 0.01, minSail: 0.003 },
  { id: 'scene-brace', minHull: 0.01, minSail: 0.003 },
  { id: 'scene-ram', minHull: 0.01, minSail: 0 },
];

console.log('--- canvas hull/sail visibility ---');
console.log('canvas                  size       hull%    sail%');
let pixelFail = false;
for (const spec of CANVASES) {
  const m = await measureCanvas(spec.id);
  if (!m) {
    console.error(`  ${spec.id.padEnd(22)} MISSING or zero-size canvas`);
    pixelFail = true;
    continue;
  }
  const hullPct = (m.hullFrac * 100).toFixed(2);
  const sailPct = (m.sailFrac * 100).toFixed(2);
  const hullOk = m.hullFrac >= spec.minHull;
  const sailOk = m.sailFrac >= spec.minSail;
  const flag = hullOk && sailOk ? '' : '  <-- BELOW THRESHOLD';
  console.log(`  ${spec.id.padEnd(22)} ${(`${m.width}x${m.height}`).padEnd(10)} ${hullPct.padStart(6)}%  ${sailPct.padStart(6)}%${flag}`);
  if (!hullOk || !sailOk) pixelFail = true;
  if (SHOTS) {
    const handle = await page.$(`#${spec.id}`);
    if (handle) await handle.screenshot({ path: `${SHOTS}/${spec.id}.png` });
  }
}

if (SHOTS) {
  await page.screenshot({ path: `${SHOTS}/controls-full.png`, fullPage: true });
}

if (pixelFail) {
  console.error('\nFAIL: one or more canvases were blank or had hull/sails below the visibility threshold.');
  await browser.close();
  process.exit(1);
}
console.log('\nOK: every canvas rendered with hull and sails visibly present\n');

if (errors.length) {
  console.error('FAIL: page errors\n  ' + errors.slice(0, 5).join('\n  '));
  await browser.close();
  process.exit(1);
}

console.log('ALL CHECKS PASSED');
await browser.close();
