/* Cannonballs, splashes, smoke.
 *
 * Projectiles are pooled thin instances of a single small mesh: a volley from
 * a galleon is 22 balls, and two ships trading fire can put 40+ in the air, so
 * one draw call matters more than the shape of a cannonball does.
 *
 * Puffs (muzzle smoke, splashes, impacts) are pooled billboard-ish quads that
 * expand and fade. They are cosmetic only — the simulation has already decided
 * what happened.
 */

import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh as BabylonMesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { ProjectileState } from '../sim/types.ts';

const MAX_BALLS = 160;
const MAX_PUFFS = 90;

function makeBallMesh(scene: Scene): BabylonMesh {
  // A cube, not a sphere. At this size it is two pixels across, and a cube is
  // 12 triangles against a sphere's few hundred.
  const r = 0.32;
  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  const faces: Array<[number[], number[], number[], number[]]> = [
    [[-r, -r, r], [r, -r, r], [r, r, r], [-r, r, r]],
    [[r, -r, -r], [-r, -r, -r], [-r, r, -r], [r, r, -r]],
    [[-r, -r, -r], [-r, -r, r], [-r, r, r], [-r, r, -r]],
    [[r, -r, r], [r, -r, -r], [r, r, -r], [r, r, r]],
    [[-r, r, r], [r, r, r], [r, r, -r], [-r, r, -r]],
    [[-r, -r, -r], [r, -r, -r], [r, -r, r], [-r, -r, r]],
  ];
  for (const quad of faces) {
    const base = positions.length / 3;
    for (const v of quad) { positions.push(v[0], v[1], v[2]); normals.push(0, 1, 0); }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const m = new BabylonMesh('ball', scene);
  const vd = new VertexData();
  vd.positions = positions; vd.indices = indices; vd.normals = normals;
  vd.applyToMesh(m);
  return m;
}

function makeQuadMesh(scene: Scene, name: string): BabylonMesh {
  const m = new BabylonMesh(name, scene);
  const vd = new VertexData();
  vd.positions = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
  vd.indices = [0, 1, 2, 0, 2, 3];
  vd.normals = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
  vd.applyToMesh(m);
  return m;
}

/** Flat ring laid on the water, marking where a broadside would land. */
export function makeReticle(scene: Scene, hex: string): BabylonMesh {
  const SEG = 20, inner = 3.4, outer = 4.4;
  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    positions.push(Math.cos(a) * inner, 0, Math.sin(a) * inner);
    positions.push(Math.cos(a) * outer, 0, Math.sin(a) * outer);
    normals.push(0, 1, 0, 0, 1, 0);
  }
  for (let i = 0; i < SEG; i++) {
    const b = i * 2;
    indices.push(b, b + 1, b + 3, b, b + 3, b + 2);
  }
  const m = new BabylonMesh('reticle', scene);
  const vd = new VertexData();
  vd.positions = positions; vd.indices = indices; vd.normals = normals;
  vd.applyToMesh(m);

  const mat = new StandardMaterial('reticleMat', scene);
  mat.disableLighting = true;
  mat.emissiveColor = Color3.FromHexString(hex);
  mat.backFaceCulling = false;
  mat.alpha = 0.75;
  mat.specularColor = new Color3(0, 0, 0);
  m.material = mat;
  m.isPickable = false;
  m.applyFog = false;
  return m;
}

interface Puff {
  x: number; y: number; z: number;
  life: number; maxLife: number; size: number; rise: number;
}

export class Effects {
  private balls: BabylonMesh;
  private puffMesh: BabylonMesh;
  private puffs: Puff[] = [];
  private ballMatrices = new Float32Array(MAX_BALLS * 16);
  private puffMatrices = new Float32Array(MAX_PUFFS * 16);

  constructor(scene: Scene) {
    const ballMat = new StandardMaterial('ballMat', scene);
    ballMat.diffuseColor = new Color3(0.12, 0.12, 0.13);
    ballMat.specularColor = new Color3(0, 0, 0);
    this.balls = makeBallMesh(scene);
    this.balls.material = ballMat;
    this.balls.isPickable = false;
    this.balls.alwaysSelectAsActiveMesh = true;
    this.balls.thinInstanceSetBuffer('matrix', this.ballMatrices, 16, false);

    const puffMat = new StandardMaterial('puffMat', scene);
    puffMat.disableLighting = true;
    puffMat.emissiveColor = new Color3(1, 1, 1);
    puffMat.backFaceCulling = false;
    puffMat.alpha = 0.5;
    puffMat.specularColor = new Color3(0, 0, 0);
    this.puffMesh = makeQuadMesh(scene, 'puff');
    this.puffMesh.material = puffMat;
    this.puffMesh.isPickable = false;
    this.puffMesh.alwaysSelectAsActiveMesh = true;
    this.puffMesh.thinInstanceSetBuffer('matrix', this.puffMatrices, 16, false);
  }

  spawnPuff(x: number, y: number, z: number, size: number, life: number, rise: number): void {
    if (this.puffs.length >= MAX_PUFFS) this.puffs.shift();
    this.puffs.push({ x, y, z, life, maxLife: life, size, rise });
  }

  /** Position the cannonball instances from the authoritative snapshot. */
  syncProjectiles(projectiles: ProjectileState[]): void {
    const n = Math.min(projectiles.length, MAX_BALLS);
    for (let i = 0; i < n; i++) {
      const p = projectiles[i];
      Matrix.Translation(p.x, p.y, p.z).copyToArray(this.ballMatrices, i * 16);
    }
    // Park the unused instances far below; cheaper than resizing the buffer.
    for (let i = n; i < MAX_BALLS; i++) {
      Matrix.Translation(0, -10000, 0).copyToArray(this.ballMatrices, i * 16);
    }
    this.balls.thinInstanceCount = MAX_BALLS;
    this.balls.thinInstanceBufferUpdated('matrix');
  }

  /** Advance and draw the smoke. `camera` is used to face the quads. */
  update(dt: number, cameraPos: Vector3): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      p.y += p.rise * dt;
      if (p.life <= 0) this.puffs.splice(i, 1);
    }

    const n = Math.min(this.puffs.length, MAX_PUFFS);
    for (let i = 0; i < n; i++) {
      const p = this.puffs[i];
      const t = 1 - p.life / p.maxLife;
      const scale = p.size * (0.4 + t * 1.6);
      // Yaw the quad toward the camera — enough of a billboard at this size,
      // without a per-frame lookAt per puff.
      const yaw = Math.atan2(cameraPos.x - p.x, cameraPos.z - p.z);
      const m = Matrix.Scaling(scale, scale, scale).multiply(Matrix.RotationY(yaw));
      m.setRowFromFloats(3, p.x, p.y, p.z, 1);
      m.copyToArray(this.puffMatrices, i * 16);
    }
    for (let i = n; i < MAX_PUFFS; i++) {
      Matrix.Translation(0, -10000, 0).copyToArray(this.puffMatrices, i * 16);
    }
    this.puffMesh.thinInstanceCount = MAX_PUFFS;
    this.puffMesh.thinInstanceBufferUpdated('matrix');

  }

  dispose(): void {
    this.balls.dispose();
    this.puffMesh.dispose();
  }
}
