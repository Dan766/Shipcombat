/* Weather presets.

   Each entry is a complete atmosphere: sky gradient, light rig, fog range,
   sea state and precipitation, plus the gameplay numbers that go with it.
   Everything the renderer needs was already parameterised, so a weather state
   is data rather than code.

   The design intent is that weather changes what you can DO, not just what you
   can see. Wave height drives gunnery accuracy, wind strength drives speed,
   and visibility drives how late you spot a target. Fog is deliberately the
   odd one out — flat calm water but almost no sight line, so it favours
   ambush rather than gunnery.

   Load order: lowpoly3d.js -> ships.js -> shipclasses.js -> weather.js -> scenes.js */

const WEATHER = {
  clear: {
    id: 'clear',
    name: 'Clear',
    summary: 'Glassy water, endless sight lines, and barely enough wind to work with.',
    sea: 'Glassy', wind: 'Light', visibility: '100%',
    effect: 'Best gunnery conditions in the game and the worst sailing. Fights ' +
      'are decided by positioning, because everyone can see everyone.',
    sky: { top: '#2f7fd0', mid: '#87c3ee', horizon: '#e4f1f9', cloud: '#ffffff' },
    sun: {
      dir: [-0.42, 0.72, 0.55], color: '#fff8e4', skyFill: '#e6f1fc',
      groundFill: '#a8b6b0', ambient: 0.86, strength: 0.54, wrap: 0.35,
    },
    fog: { color: '#e4f1f9', start: 130, end: 540 },
    ocean: { deep: '#2f9fc0', crest: '#86dbe2', amp: 0.32, foamStart: null },
    clouds: [
      { x: 0.22, y: 0.14, s: 0.09, seed: 3, alpha: 0.7 },
      { x: 0.79, y: 0.19, s: 0.08, seed: 15, alpha: 0.6 },
    ],
    heel: 0.02,
  },

  fair: {
    id: 'fair',
    name: 'Fair',
    summary: 'A working breeze and a moderate chop. The baseline everything else is tuned against.',
    sea: 'Moderate', wind: 'Steady', visibility: '90%',
    effect: 'The default condition. Enough swell to matter at long range, ' +
      'enough wind to make heading choices count.',
    sky: { top: '#3f8ad4', mid: '#8bbfe9', horizon: '#dcecf6', cloud: '#ffffff' },
    sun: {
      dir: [-0.42, 0.68, 0.6], color: '#fff4dc', skyFill: '#e2eefa',
      groundFill: '#9fb0ab', ambient: 0.84, strength: 0.48, wrap: 0.35,
    },
    fog: { color: '#d8e8f2', start: 70, end: 380 },
    ocean: { deep: '#2f97b8', crest: '#7ed6dd', amp: 1.1, foamStart: 0.42 },
    clouds: [
      { x: 0.18, y: 0.15, s: 0.12, seed: 3, alpha: 0.9 },
      { x: 0.54, y: 0.09, s: 0.1, seed: 8, alpha: 0.82 },
      { x: 0.84, y: 0.19, s: 0.14, seed: 15, alpha: 0.88 },
    ],
    heel: 0.06,
  },

  squall: {
    id: 'squall',
    name: 'Squall',
    summary: 'Grey, gusting and wet. Whitecaps everywhere and half the horizon gone.',
    sea: 'Choppy', wind: 'Strong, gusting', visibility: '55%',
    effect: 'Ships move noticeably faster and shoot noticeably worse. Favours ' +
      'closing the distance over trading at range.',
    sky: { top: '#57697a', mid: '#8b9aa6', horizon: '#b0bbc2', cloud: '#7f8d99' },
    sun: {
      dir: [-0.38, 0.62, 0.55], color: '#e8eef2', skyFill: '#c9d6de',
      groundFill: '#7d868a', ambient: 0.8, strength: 0.2, wrap: 0.5,
    },
    fog: { color: '#a9b5bd', start: 45, end: 220 },
    ocean: { deep: '#347584', crest: '#79bec5', amp: 1.95, foamStart: 0.30 },
    clouds: [
      { x: 0.16, y: 0.1, s: 0.19, seed: 5, alpha: 0.85 },
      { x: 0.48, y: 0.06, s: 0.22, seed: 11, alpha: 0.8 },
      { x: 0.82, y: 0.13, s: 0.2, seed: 19, alpha: 0.82 },
    ],
    rain: { density: 240, angle: 0.34, alpha: 0.17, length: 30, color: '#dfeaf1', seed: 7 },
    heel: 0.13,
  },

  storm: {
    id: 'storm',
    name: 'Storm',
    summary: 'Heavy sea, gale wind, and visibility down to a few hundred metres.',
    sea: 'Heavy', wind: 'Gale', visibility: '30%',
    effect: 'Long-range gunnery is close to worthless. Fights become short, ' +
      'ugly and decided at knife range — which is the light classes’ only ' +
      'real window against a Galleon.',
    sky: { top: '#38424e', mid: '#5a6672', horizon: '#79858f', cloud: '#4f5a67' },
    sun: {
      dir: [-0.3, 0.6, 0.5], color: '#dfe6ec', skyFill: '#98a6b2',
      groundFill: '#5d666c', ambient: 0.78, strength: 0.14, wrap: 0.6,
    },
    fog: { color: '#6d7a84', start: 26, end: 150 },
    ocean: { deep: '#31606b', crest: '#6b9ea5', amp: 3.1, foamStart: 0.24 },
    clouds: [
      { x: 0.12, y: 0.08, s: 0.24, seed: 2, alpha: 0.9 },
      { x: 0.45, y: 0.04, s: 0.28, seed: 13, alpha: 0.88 },
      { x: 0.8, y: 0.1, s: 0.26, seed: 23, alpha: 0.9 },
    ],
    rain: { density: 430, angle: 0.52, alpha: 0.24, length: 40, color: '#e3ecf2', seed: 4 },
    heel: 0.22,
  },

  fog: {
    id: 'fog',
    name: 'Fog',
    summary: 'Flat calm and nearly blind. The sea state everyone else’s rules stop applying to.',
    sea: 'Slight', wind: 'Light', visibility: '15%',
    effect: 'Gunnery is fine; finding anything to shoot is not. Rewards ' +
      'ambush, punishes big slow silhouettes, and makes the minimap matter ' +
      'more than the screen.',
    sky: { top: '#b4c2c9', mid: '#ccd6da', horizon: '#dfe6e8', cloud: '#d6dee1' },
    sun: {
      dir: [-0.2, 0.9, 0.3], color: '#eef2f4', skyFill: '#dfe7ea',
      groundFill: '#aab2b4', ambient: 0.95, strength: 0.06, wrap: 0.8,
    },
    fog: { color: '#dfe6e8', start: 4, end: 58 },
    ocean: { deep: '#6f9098', crest: '#9dbcc0', amp: 0.5, foamStart: null },
    clouds: [],
    heel: 0.03,
  },
};

const WEATHER_ORDER = ['clear', 'fair', 'squall', 'storm', 'fog'];
