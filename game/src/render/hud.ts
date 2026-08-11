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
import { firingSide } from '../sim/bot.ts';
import type { AmmoId, ShipState } from '../sim/types.ts';
import { angleOffWind, pointOfSailName } from '../sim/wind.ts';

export interface HudModel {
  me: ShipState;
  target?: ShipState;
  windFrom: number;
  weather: WeatherId;
  aimRange: number;
  ammo: AmmoId;
  latencyMs: number;
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

  el.innerHTML = `
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
      <div class="sub">Sail ${Math.round(m.me.sail * 100)}% &middot; ${m.latencyMs} ms</div>
    </div>
    <div class="panel guns">
      <div class="cols">
        <div class="col">
          <div class="lbl">Port</div>
          ${pips(m.me.reloadPort, guns)}
          <div class="st ${m.me.reloadPort >= 1 ? 'rdy' : ''}">${
            m.me.reloadPort >= 1 ? 'Ready' : `${((1 - m.me.reloadPort) * cls.combat.reloadSec).toFixed(1)}s`}</div>
        </div>
        <div class="col">
          <div class="lbl">Starboard</div>
          ${pips(m.me.reloadStbd, guns)}
          <div class="st ${m.me.reloadStbd >= 1 ? 'rdy' : ''}">${
            m.me.reloadStbd >= 1 ? 'Ready' : `${((1 - m.me.reloadStbd) * cls.combat.reloadSec).toFixed(1)}s`}</div>
        </div>
      </div>
      <div class="ammo">
        ${(['round', 'chain'] as AmmoId[]).map((a) =>
          `<span class="chip${a === m.ammo ? ' on' : ''}">${AMMO[a].label}</span>`).join('')}
        <span class="rangechip">Range ${m.aimRange.toFixed(0)} m</span>
      </div>
      <div class="keys">A/D steer &middot; W/S sail &middot; Q/E fire &middot; R ammo &middot; wheel range &middot; C class &middot; 1-5 weather</div>
    </div>
    ${sinking}`;
}
