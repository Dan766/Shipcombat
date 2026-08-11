/* Plain mesh -> Babylon VertexData.
 *
 * Every triangle gets its own three vertices. That is what produces flat
 * shading (adjacent faces share no normals) and it lets each face carry its
 * own colour without a texture — the two things the art direction rests on.
 */

import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh as BabylonMesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from './geometry.ts';

const cache = new Map<string, Color3>();

export function hexToColor3(hex: string): Color3 {
  let c = cache.get(hex);
  if (!c) {
    c = Color3.FromHexString(hex.length === 7 ? hex : '#888888');
    cache.set(hex, c);
  }
  return c;
}

export interface BuiltVertexData {
  positions: number[];
  indices: number[];
  normals: number[];
  colors: number[];
}

/** Triangulate to unique, flat-shaded vertices with per-face colour. */
export function buildVertexData(m: Mesh): BuiltVertexData {
  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  const emitTri = (a: number[], b: number[], c: number[], col: Color3) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    for (const p of [a, b, c]) {
      const base = positions.length / 3;
      positions.push(p[0], p[1], p[2]);
      normals.push(nx, ny, nz);
      colors.push(col.r, col.g, col.b, 1);
      indices.push(base);
    }
  };

  for (const f of m.faces) {
    const col = hexToColor3(f.color);
    const poly = f.i.map((i) => m.verts[i]);
    // Fan-triangulate; every face here is convex.
    for (let k = 1; k < poly.length - 1; k++) {
      emitTri(poly[0], poly[k], poly[k + 1], col);
      // Thin cloth: emit the reverse winding too so back-face culling can
      // stay on everywhere else.
      if (f.noCull) emitTri(poly[0], poly[k + 1], poly[k], col);
    }
  }

  return { positions, indices, normals, colors };
}

export function toBabylonMesh(m: Mesh, name: string, scene: Scene): BabylonMesh {
  const built = buildVertexData(m);
  const babylonMesh = new BabylonMesh(name, scene);
  const vd = new VertexData();
  vd.positions = built.positions;
  vd.indices = built.indices;
  vd.normals = built.normals;
  vd.colors = built.colors;
  vd.applyToMesh(babylonMesh);
  return babylonMesh;
}
