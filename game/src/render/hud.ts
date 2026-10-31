/* The combat HUD.
 *
 * Layout follows the Combat HUD mockup: target readout top-left, wind
 * top-centre, own hull and rigging bottom-left, broadside state bottom-centre.
 * The mockup's panels finally have real data behind them.
 *
 * Reads snapshot state and never writes it.
 */

import { SHIP_CLASSES } from '../data/shipClasses.ts';
import { WEATHER, type WeatherId } from '../data/weather.ts';
import { AMMO } from '../sim/combat.ts';
import { bearingTo, firingSide } from '../sim/bot.ts';
import { type FireMount } from '../sim/lookSector.ts';
import type { AmmoId, ShipState } from '../sim/types.ts';
import { angleOffWind, normalizeAngle, pointOfSailName } from '../sim/wind.ts';

const RAD2DEG = 180 / Math.PI;

export interface HudModel {
  me: ShipState;
  target?: ShipState;
  windFrom: number;
  weather: WeatherId;
  aimRange: number;
  ammo: AmmoId;
  latencyMs: number;
  /** Weapon the look-directed scheme currently arms. */
  armedMount: FireMount;
  /** World-space camera yaw, radians — for the off-screen target indicator. */
  camYawWorld: number;
  /** Camera vertical FOV, radians. */
  fov: number;
}

const MOUNT_LABEL: Record<FireMount, string> = {
  bow: 'Bow', starboard: 'Stbd', stern: 'Stern', port: 'Port',
};

/* Heading ribbon: a compass strip across the top so steering stays legible
 * while free-look has the camera pointed abeam. Shows a window centred on the
 * ship's own heading; `0` is used as the ribbon's own north — there is no
 * real-world compass out here, just a stable reference to read turns against. */
const RIBBON_WINDOW_DEG = 180;
const RIBBON_TICK_DEG = 15;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function wrapDeg(d: number): number {
  let r = d % 360;
  if (r > 180) r -= 360;
  if (r < -180) r += 360;
  return r;
}

function renderRibbon(m: HudModel): string {
  const headingDeg = (m.me.heading * RAD2DEG) % 360;
  let ticks = '';
  const start = Math.ceil((headingDeg - RIBBON_WINDOW_DEG / 2) / RIBBON_TICK_DEG) * RIBBON_TICK_DEG;
  for (let d = start; d <= headingDeg + RIBBON_WINDOW_DEG / 2; d += RIBBON_TICK_DEG) {
    const rel = wrapDeg(d - headingDeg);
    const pct = 50 + (rel / RIBBON_WINDOW_DEG) * 100;
    const norm = ((Math.round(d / 45) * 45) % 360 + 360) % 360;
    const major = Math.abs(d - norm) < 1e-6;
    const label = major ? COMPASS[Math.round(norm / 45) % 8] : '';
    ticks += `<span class="tick${major ? ' major' : ''}" style="left:${pct}%">${label}</span>`;
  }

  let marker = '';
  if (m.target && m.target.sinking === 0) {
    const bearingDeg = bearingTo(m.me, m.target) * RAD2DEG;
    const rel = wrapDeg(bearingDeg - headingDeg);
    if (Math.abs(rel) <= RIBBON_WINDOW_DEG / 2) {
      const pct = 50 + (rel / RIBBON_WINDOW_DEG) * 100;
      marker = `<span class="rmark" style="left:${pct}%">&#9660;</span>`;
    }
  }

  return `<div class="panel ribbon">
    <div class="rticks">${ticks}${marker}</div>
    <div class="rcursor"></div>
  </div>`;
}

/* Off-screen target indicator: free-look means the fight can be entirely out
 * of frame. If the target's bearing from the *camera* (not the ship) falls
 * outside the FOV, pin an arrow to the edge pointing toward it. */
function renderOffscreen(m: HudModel): string {
  if (!m.target || m.target.sinking > 0) return '';
  const bearing = bearingTo(m.me, m.target);
  const rel = normalizeAngle(bearing - m.camYawWorld);
  if (Math.abs(rel) <= m.fov / 2) return '';
  const range = Math.hypot(m.target.x - m.me.x, m.target.z - m.me.z);
  const side = rel < 0 ? 'left' : 'right';
  const arrow = rel < 0 ? '&#9664;' : '&#9654;';
  return `<div class="offscreen ${side}">
    <span class="arrow">${arrow}</span>
    <span class="rng">${range.toFixed(0)}m</span>
  </div>`;
}

function bar(label: string, value: number, tone: string): string {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return `<div class="bar">
    <span class="bl">${label}</span>
    <span class="bt"><span class="bf" style="width:${pct}%;background:${tone}"></span></span>
    <span class="bv">${pct}%</span>
  </div>`;
}

function pips(ready: number, count: number): string {
  // One pip per gun, filling left to right as the side reloads.
  const filled = Math.floor(ready * count + 1e-6);
  let out = '<span class="pips">';
  for (let i = 0; i < count; i++) out += `<span class="pip${i < filled ? ' on' : ''}"></span>`;
  return out + '</span>';
}

function tone(v: number): string {
  return v > 0.6 ? '#63b981' : v > 0.3 ? '#e89a3c' : '#e05a3c';
}

export function renderHud(el: HTMLElement, m: HudModel): void {
  const cls = SHIP_CLASSES[m.me.cls];
  const guns = cls.combat.gunsPerSide;
  const off = angleOffWind(m.me.heading, m.windFrom);
  const knots = m.me.speed * 1.94384;

  let targetPanel = '';
  if (m.target) {
    const tcls = SHIP_CLASSES[m.target.cls];
    const range = Math.hypot(m.target.x - m.me.x, m.target.z - m.me.z);
    const side = firingSide(m.me, m.target);
    const arc = side === -1 ? 'Port arc' : side === 1 ? 'Starboard arc' : 'Not bearing';
    targetPanel = `<div class="panel target">
      <div class="lbl">Target</div>
      <div class="name">${tcls.name}</div>
      ${bar('Hull', m.target.hull, tone(m.target.hull))}
      ${bar('Rig', m.target.rig, tone(m.target.rig))}
      <div class="sub">Range ${range.toFixed(0)} m &middot; <b class="${side ? 'bearing' : ''}">${arc}</b></div>
    </div>`;
  }

  const sinking = m.me.sinking > 0
    ? '<div class="panel sunk">SINKING</div>' : '';

  const mountCol = (mount: FireMount, ready: number, count: number, reloadSec: number): string => `
    <div class="col ${mount === m.armedMount ? 'armed' : ''}">
      <div class="lbl">${MOUNT_LABEL[mount]}</div>
      ${pips(ready, count)}
      <div class="st ${ready >= 1 ? 'rdy' : ''}">${ready >= 1 ? 'Ready' : `${((1 - ready) * reloadSec).toFixed(1)}s`}</div>
    </div>`;

  el.innerHTML = `
    ${renderRibbon(m)}
    ${renderOffscreen(m)}
    ${targetPanel}
    <div class="panel wind">
      <div class="lbl">Wind</div>
      <div class="name">${pointOfSailName(off)}</div>
      <div class="sub">${knots.toFixed(1)} kn &middot; ${WEATHER[m.weather].name}</div>
    </div>
    <div class="panel own">
      <div class="lbl">Your Ship</div>
      <div class="name">${cls.name} <span class="dim">${cls.rig}</span></div>
      ${bar('Hull', m.me.hull, tone(m.me.hull))}
      ${bar('Rig', m.me.rig, tone(m.me.rig))}
      ${bar(m.me.boosting ? 'RAM!' : 'Boost', m.me.boost, m.me.boosting ? '#e2a84f' : '#6aa8d8')}
      <div class="sub">Sail ${Math.round(m.me.sail * 100)}% &middot; ${m.latencyMs} ms</div>
    </div>
    <div class="panel guns">
      <div class="cols">
        ${mountCol('bow', m.me.reloadBow, cls.combat.bowChasers.guns, cls.combat.bowChasers.reloadSec)}
        ${mountCol('port', m.me.reloadPort, guns, cls.combat.reloadSec)}
        ${mountCol('starboard', m.me.reloadStbd, guns, cls.combat.reloadSec)}
        ${mountCol('stern', m.me.reloadStern, 1, cls.combat.dropWeapon.reloadSec)}
      </div>
      <div class="ammo">
        ${(['round', 'chain'] as AmmoId[]).map((a) =>
          `<span class="chip${a === m.ammo ? ' on' : ''}">${AMMO[a].label}</span>`).join('')}
        <span class="rangechip">Range ${m.aimRange.toFixed(0)} m</span>
      </div>
      <div class="keys">A/D steer &middot; W/S sail &middot; Shift boost/ram &middot; mouse look &middot; LMB fire &middot; hold RMB aim &middot; R ammo &middot; wheel range &middot; C class &middot; 1-5 weather</div>
    </div>
    ${sinking}`;
}
