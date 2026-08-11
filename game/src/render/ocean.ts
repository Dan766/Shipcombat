/* The sea.
 *
 * A static flat-shaded sheet built once per weather change. Quadratic cell
 * spacing puts fine facets near the arena centre and coarse ones out at the
 * horizon, which is where the haze swallows them anyway.
 *
 * Waves do not animate in this slice. The scope here is proving the art
 * direction and the sailing model; animating the surface means rebuilding
 * ~70k vertices per frame in JS, which would measure the vertex-update cost
 * rather than the art direction's cost. Deferred to a vertex shader.
 */

import { Mesh as BabylonMesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { WeatherDef } from '../data/weather.ts';
import { waveHeight } from '../sim/waves.ts';
import { hexToColor3 } from './toBabylon.ts';

const HALF_SIZE = 900;
const CELLS = 110;
/** Facets wider than this never break into foam — see prototype README. */
const FOAM_MAX_CELL = 7;

function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildOcean(w: WeatherDef, scene: Scene): BabylonMesh {
  const rng = seededRandom(11);
  const deep = hexToColor3(w.ocean.deep);
  const crest = hexToColor3(w.ocean.crest);
  const foam = hexToColor3('#b7cfd6');
  const amp = w.ocean.amp;
  const foamStart = w.ocean.foamStart == null ? Infinity : w.ocean.foamStart * amp;

  const coord: number[] = [];
  for (let i = 0; i <= CELLS; i++) {
    const u = (i / CELLS) * 2 - 1;
    coord.push(Math.sign(u) * Math.pow(Math.abs(u), 2.2) * HALF_SIZE);
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  const emitTri = (a: number[], b: number[], c: number[], r: number, g: number, bl: number) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const p of [a, b, c]) {
      indices.push(positions.length / 3);
      positions.push(p[0], p[1], p[2]);
      normals.push(nx, ny, nz);
      colors.push(r, g, bl, 1);
    }
  };

  const h = (x: number, z: number) => waveHeight(x, z, amp);

  for (let i = 0; i < CELLS; i++) {
    for (let j = 0; j < CELLS; j++) {
      const x0 = coord[i], x1 = coord[i + 1];
      const z0 = coord[j], z1 = coord[j + 1];
      const a = [x0, h(x0, z0), z0];
      const b = [x1, h(x1, z0), z0];
      const c = [x1, h(x1, z1), z1];
      const d = [x0, h(x0, z1), z1];

      const avgY = (a[1] + b[1] + c[1] + d[1]) / 4;
      const t = Math.min(1, Math.max(0, avgY * 0.55 + 0.5)) * 0.5 + rng() * 0.12;
      let r = deep.r + (crest.r - deep.r) * t;
      let g = deep.g + (crest.g - deep.g) * t;
      let bl = deep.b + (crest.b - deep.b) * t;

      const cellW = Math.max(x1 - x0, z1 - z0);
      if (avgY > foamStart && cellW < FOAM_MAX_CELL) {
        const f = Math.min(1, (avgY - foamStart) / 0.7) * (0.45 + rng() * 0.45);
        r += (foam.r - r) * f;
        g += (foam.g - g) * f;
        bl += (foam.b - bl) * f;
      }

      emitTri(a, b, c, r, g, bl);
      emitTri(a, c, d, r, g, bl);
    }
  }

  const meshObj = new BabylonMesh('ocean', scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  vd.colors = colors;
  vd.applyToMesh(meshObj);
  meshObj.isPickable = false;
  return meshObj;
}
