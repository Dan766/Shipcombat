/* Rain, drawn on a 2D overlay above the 3D view.
 *
 * Ported from the prototype's screen-space pass. A particle system would sit
 * in the scene more correctly, but rain this close to the lens is a
 * screen-space effect in practice and this costs nothing on the GPU budget
 * the framerate check is measuring.
 */

import type { WeatherDef } from '../data/weather.ts';

type Rain = NonNullable<WeatherDef['rain']>;

interface Drop { x: number; y: number; depth: number }

let drops: Drop[] = [];
let dropsFor: Rain | null = null;
let lastTime = 0;

function seedDrops(rain: Rain, w: number, h: number): void {
  drops = [];
  let a = 21;
  const rnd = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < rain.density; i++) {
    drops.push({ x: rnd() * w * 1.3 - w * 0.15, y: rnd() * h, depth: 0.35 + rnd() * 0.65 });
  }
  dropsFor = rain;
}

export function drawRain(canvas: HTMLCanvasElement, rain: Rain | undefined, nowMs: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!rain) { drops = []; dropsFor = null; return; }

  if (dropsFor !== rain || drops.length === 0) seedDrops(rain, w, h);
  const dt = Math.min((nowMs - lastTime) / 1000, 0.1);
  lastTime = nowMs;

  const dx = Math.sin(rain.angle), dy = Math.cos(rain.angle);
  const fall = 900;

  ctx.strokeStyle = rain.color;
  ctx.lineCap = 'round';
  for (const d of drops) {
    d.x += dx * fall * d.depth * dt;
    d.y += dy * fall * d.depth * dt;
    if (d.y > h) { d.y -= h; d.x = (d.x + w * 0.37) % (w * 1.3) - w * 0.15; }
    if (d.x > w * 1.15) d.x -= w * 1.3;

    const len = rain.length * d.depth;
    ctx.globalAlpha = rain.alpha * d.depth * (0.45 + 0.55 * (d.y / h));
    ctx.lineWidth = 0.7 + d.depth * 0.9;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + dx * len, d.y + dy * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
