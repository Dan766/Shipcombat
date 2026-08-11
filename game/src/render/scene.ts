/* The Babylon scene — where the art direction actually lands.
 *
 * The spec is in GAME_DESIGN.md: ambient dominates the key, distance haze
 * does the depth work, one flat fill per triangle.
 *
 * Two corrections against the prototype's Babylon notes, found in porting:
 *  - Fog is LINEAR, not EXP. The prototype fades with smoothstep(start, end),
 *    which linear fog matches directly.
 *  - The waterline hull clip is not ported. It existed only because a
 *    painter's-algorithm renderer could not sort a hull against ocean facets.
 */

import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh as BabylonMesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import '@babylonjs/core/Meshes/thinInstanceMesh';

import type { WeatherDef } from '../data/weather.ts';
import { hexToColor3 } from './toBabylon.ts';

export interface Rig {
  engine: Engine;
  scene: Scene;
  camera: FreeCamera;
  hemi: HemisphericLight;
  sun: DirectionalLight;
  /** Unlit material for sky and clouds. */
  skyMat: StandardMaterial;
  /** Vertex-coloured material for everything in the world. */
  worldMat: StandardMaterial;
  applyWeather(w: WeatherDef): void;
}

export function createRig(canvas: HTMLCanvasElement): Rig {
  const engine = new Engine(canvas, true, { stencil: false, antialias: true }, true);
  const scene = new Scene(engine);

  const camera = new FreeCamera('cam', new Vector3(-25, 12, -25), scene);
  camera.minZ = 0.5;
  camera.maxZ = 1400;
  camera.fov = 0.87; // ~50 degrees, matching the mockups

  // Ambient carries roughly twice the key — the whole reason the look is airy
  // rather than dramatic. groundColor is the fill from below.
  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  const sun = new DirectionalLight('sun', new Vector3(0.42, -0.68, -0.6), scene);

  const worldMat = new StandardMaterial('world', scene);
  worldMat.specularColor = new Color3(0, 0, 0); // flat shading has no highlights
  worldMat.backFaceCulling = true;

  const skyMat = new StandardMaterial('sky', scene);
  skyMat.disableLighting = true;
  skyMat.backFaceCulling = false;
  skyMat.specularColor = new Color3(0, 0, 0);
  skyMat.emissiveColor = new Color3(1, 1, 1);

  const applyWeather = (w: WeatherDef) => {
    hemi.intensity = w.sun.ambient;
    hemi.diffuse = hexToColor3(w.sun.skyFill);
    hemi.groundColor = hexToColor3(w.sun.groundFill);

    sun.intensity = w.sun.strength;
    sun.direction = new Vector3(-w.sun.dir[0], -w.sun.dir[1], -w.sun.dir[2]);
    sun.diffuse = hexToColor3(w.sun.color);

    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = hexToColor3(w.fog.color);
    scene.fogStart = w.fog.start;
    scene.fogEnd = w.fog.end;

    scene.clearColor = Color4.FromColor3(hexToColor3(w.sky.horizon));
  };

  return { engine, scene, camera, hemi, sun, skyMat, worldMat, applyWeather };
}

/**
 * Sky dome: a large inverted cylinder carrying the three-stop vertical
 * gradient from the weather preset as vertex colours. Unlit and fog-exempt,
 * so it stays the backdrop rather than being hazed into flat grey.
 */
export function buildSky(w: WeatherDef, scene: Scene, mat: StandardMaterial): BabylonMesh {
  const R = 1200, H = 700, SEG = 24;
  const top = hexToColor3(w.sky.top);
  const mid = hexToColor3(w.sky.mid);
  const hor = hexToColor3(w.sky.horizon);

  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];

  // Three stacked rings: horizon, mid, top.
  const rings = [
    { y: -60, c: hor },
    { y: H * 0.45, c: mid },
    { y: H, c: top },
  ];

  for (const ring of rings) {
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      positions.push(Math.cos(a) * R, ring.y, Math.sin(a) * R);
      colors.push(ring.c.r, ring.c.g, ring.c.b, 1);
      normals.push(0, 0, 0);
    }
  }
  const cap = positions.length / 3;
  positions.push(0, H * 1.05, 0);
  colors.push(top.r, top.g, top.b, 1);
  normals.push(0, 0, 0);

  const rowLen = SEG + 1;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let s = 0; s < SEG; s++) {
      const a = r * rowLen + s, b = a + 1;
      const c = (r + 1) * rowLen + s, d = c + 1;
      // Wound inward — the camera is inside the dome.
      indices.push(a, c, b, b, c, d);
    }
  }
  for (let s = 0; s < SEG; s++) {
    const a = (rings.length - 1) * rowLen + s;
    indices.push(a, cap, a + 1);
  }

  const sky = new BabylonMesh('sky', scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.colors = colors;
  vd.normals = normals;
  vd.applyToMesh(sky);
  sky.material = mat;
  sky.infiniteDistance = true;
  sky.applyFog = false;
  sky.isPickable = false;
  sky.renderingGroupId = 0;
  return sky;
}
