/* Weather presets — the source of truth.
 *
 * A condition bundles what it looks like (sky, light rig, fog, sea state,
 * rain) with what it does (wind strength, visibility). The simulation reads
 * `windStrength` and `oceanAmp`; the renderer reads the rest.
 *
 * MUST NOT import Babylon.
 */

export type WeatherId = 'clear' | 'fair' | 'squall' | 'storm' | 'fog';

export interface WeatherDef {
  id: WeatherId;
  name: string;
  summary: string;
  sea: string;
  wind: string;
  visibility: string;
  /** Multiplier on every ship's base speed. */
  windStrength: number;
  sky: { top: string; mid: string; horizon: string };
  sun: {
    dir: [number, number, number];
    color: string;
    skyFill: string;
    groundFill: string;
    ambient: number;
    strength: number;
  };
  fog: { color: string; start: number; end: number };
  ocean: { deep: string; crest: string; amp: number; foamStart: number | null };
  rain?: { density: number; angle: number; alpha: number; length: number; color: string };
  /** How far ships lean in this sea state, in radians. */
  heel: number;
}

export const WEATHER: Record<WeatherId, WeatherDef> = {
  clear: {
    id: 'clear',
    name: 'Clear',
    summary: 'Glassy water, endless sight lines, barely enough wind to work with.',
    sea: 'Glassy', wind: 'Light', visibility: '100%',
    windStrength: 0.55,
    sky: { top: '#2f7fd0', mid: '#87c3ee', horizon: '#e4f1f9' },
    sun: {
      dir: [-0.42, 0.72, 0.55], color: '#fff8e4', skyFill: '#e6f1fc',
      groundFill: '#a8b6b0', ambient: 0.86, strength: 0.54,
    },
    fog: { color: '#e4f1f9', start: 130, end: 540 },
    ocean: { deep: '#2f9fc0', crest: '#86dbe2', amp: 0.32, foamStart: null },
    heel: 0.02,
  },

  fair: {
    id: 'fair',
    name: 'Fair',
    summary: 'A working breeze and a moderate chop. The baseline.',
    sea: 'Moderate', wind: 'Steady', visibility: '90%',
    windStrength: 1.0,
    sky: { top: '#3f8ad4', mid: '#8bbfe9', horizon: '#dcecf6' },
    sun: {
      dir: [-0.42, 0.68, 0.6], color: '#fff4dc', skyFill: '#e2eefa',
      groundFill: '#9fb0ab', ambient: 0.84, strength: 0.48,
    },
    fog: { color: '#d8e8f2', start: 70, end: 380 },
    ocean: { deep: '#2f97b8', crest: '#7ed6dd', amp: 1.1, foamStart: 0.42 },
    heel: 0.06,
  },

  squall: {
    id: 'squall',
    name: 'Squall',
    summary: 'Grey, gusting and wet. Whitecaps everywhere.',
    sea: 'Choppy', wind: 'Strong, gusting', visibility: '55%',
    windStrength: 1.35,
    sky: { top: '#57697a', mid: '#8b9aa6', horizon: '#b0bbc2' },
    sun: {
      dir: [-0.38, 0.62, 0.55], color: '#e8eef2', skyFill: '#c9d6de',
      groundFill: '#7d868a', ambient: 0.8, strength: 0.2,
    },
    fog: { color: '#a9b5bd', start: 45, end: 220 },
    ocean: { deep: '#347584', crest: '#79bec5', amp: 1.95, foamStart: 0.3 },
    rain: { density: 240, angle: 0.34, alpha: 0.17, length: 30, color: '#dfeaf1' },
    heel: 0.13,
  },

  storm: {
    id: 'storm',
    name: 'Storm',
    summary: 'Heavy sea, gale wind, visibility down to a few hundred metres.',
    sea: 'Heavy', wind: 'Gale', visibility: '30%',
    windStrength: 1.6,
    sky: { top: '#38424e', mid: '#5a6672', horizon: '#79858f' },
    sun: {
      dir: [-0.3, 0.6, 0.5], color: '#dfe6ec', skyFill: '#98a6b2',
      groundFill: '#5d666c', ambient: 0.78, strength: 0.14,
    },
    fog: { color: '#6d7a84', start: 26, end: 150 },
    ocean: { deep: '#31606b', crest: '#6b9ea5', amp: 3.1, foamStart: 0.24 },
    rain: { density: 430, angle: 0.52, alpha: 0.24, length: 40, color: '#e3ecf2' },
    heel: 0.22,
  },

  fog: {
    id: 'fog',
    name: 'Fog',
    summary: 'Flat calm and nearly blind.',
    sea: 'Slight', wind: 'Light', visibility: '15%',
    windStrength: 0.5,
    sky: { top: '#b4c2c9', mid: '#ccd6da', horizon: '#dfe6e8' },
    sun: {
      dir: [-0.2, 0.9, 0.3], color: '#eef2f4', skyFill: '#dfe7ea',
      groundFill: '#aab2b4', ambient: 0.95, strength: 0.06,
    },
    fog: { color: '#dfe6e8', start: 4, end: 58 },
    ocean: { deep: '#6f9098', crest: '#9dbcc0', amp: 0.5, foamStart: null },
    heel: 0.03,
  },
};

export const WEATHER_ORDER: WeatherId[] = ['clear', 'fair', 'squall', 'storm', 'fog'];
