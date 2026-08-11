/* Low-poly geometry primitives.
 *
 * Transliterated from prototype/lowpoly3d.js so the ships in the game are the
 * same geometry as the ships in the mockups. Only the final conversion to a
 * GPU buffer is new — everything here is plain arrays and stays engine-free
 * so it can be unit-tested without a browser.
 */

export interface Face {
  i: number[];
  color: string;
  /** Sails are thin cloth: emitted with both windings so culling can stay on. */
  noCull?: boolean;
}

export interface Mesh {
  verts: number[][];
  faces: Face[];
}

export function mesh(): Mesh {
  return { verts: [], faces: [] };
}

export function addFace(m: Mesh, i: number[], color: string, opts?: { noCull?: boolean }): void {
  m.faces.push({ i, color, noCull: opts?.noCull });
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Box with its base on y=0, centred in x/z. */
export function makeBox(w: number, h: number, d: number, color: string): Mesh {
  const m = mesh();
  const x = w / 2, z = d / 2;
  m.verts = [
    [-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z],
    [-x, h, -z], [x, h, -z], [x, h, z], [-x, h, z],
  ];
  addFace(m, [4, 5, 6, 7], color);
  addFace(m, [0, 3, 2, 1], color);
  addFace(m, [0, 1, 5, 4], color);
  addFace(m, [2, 3, 7, 6], color);
  addFace(m, [1, 2, 6, 5], color);
  addFace(m, [3, 0, 4, 7], color);
  return m;
}

/** N-sided prism — masts, spars, trunks. Base on y=0. */
export function makePrism(rBottom: number, rTop: number, h: number, sides: number, color: string): Mesh {
  const m = mesh();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    m.verts.push([Math.cos(a) * rBottom, 0, Math.sin(a) * rBottom]);
  }
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    m.verts.push([Math.cos(a) * rTop, h, Math.sin(a) * rTop]);
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    addFace(m, [i, j, sides + j, sides + i], color);
  }
  const top: number[] = [];
  for (let i = 0; i < sides; i++) top.push(sides + i);
  addFace(m, top, color);
  return m;
}

/** The hull's plan view, as fractions of length and beam. */
export const HULL_PROFILE: Array<[number, number]> = [
  [0.50, 0.00], [0.42, 0.26], [0.26, 0.44], [0.02, 0.50],
  [-0.24, 0.48], [-0.44, 0.38], [-0.50, 0.20],
  [-0.50, -0.20], [-0.44, -0.38], [-0.24, -0.48], [0.02, -0.50],
  [0.26, -0.44], [0.42, -0.26],
];

const KEEL_TAPER_DEFAULT = 0.42;

/** Half-width at a fraction of length, as a fraction of beam. */
export function hullHalfWidthFrac(xFrac: number): number {
  const pts = HULL_PROFILE.filter((p) => p[1] >= 0);
  if (xFrac >= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (xFrac <= a[0] && xFrac >= b[0]) {
      const t = (a[0] - xFrac) / (a[0] - b[0] || 1);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return pts[pts.length - 1][1];
}

/** Where the planking sits at a point on the hull, in world units. */
export function hullSurfaceZ(xFrac: number, y: number, beam: number, depth: number): number {
  const vert = KEEL_TAPER_DEFAULT + (1 - KEEL_TAPER_DEFAULT) * clamp(y / depth, 0, 1);
  return hullHalfWidthFrac(xFrac) * beam * vert;
}

export interface HullOpts { keelTaper?: number; keelRise?: number; noCap?: boolean }

/** Lofted hull: deck ring skinned down to a narrower keel line. */
export function makeHull(
  len: number, beam: number, depth: number,
  deckColor: string, hullColor: string, opts: HullOpts = {},
): Mesh {
  const m = mesh();
  const profile = HULL_PROFILE;
  const n = profile.length;
  for (let i = 0; i < n; i++) {
    m.verts.push([profile[i][0] * len, depth, profile[i][1] * beam]);
  }
  const keelTaper = opts.keelTaper ?? KEEL_TAPER_DEFAULT;
  const keelRise = opts.keelRise ?? 0;
  for (let i = 0; i < n; i++) {
    // Sheer: bow and stern lift so the keel line curves.
    const fore = Math.abs(profile[i][0]) * 2;
    m.verts.push([profile[i][0] * len * 0.94, keelRise * fore * fore, profile[i][1] * beam * keelTaper]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    addFace(m, [i, j, n + j, n + i], hullColor);
  }
  if (!opts.noCap) {
    const deck: number[] = [];
    for (let i = 0; i < n; i++) deck.push(i);
    addFace(m, deck, deckColor);
  }
  return m;
}

/** Billowed square sail — a bulged quad grid in the x-y plane. */
export function makeSail(w: number, h: number, bulge: number, color: string, cols = 4, rows = 4): Mesh {
  const m = mesh();
  const idx: number[][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: number[] = [];
    for (let c = 0; c <= cols; c++) {
      const u = c / cols, v = r / rows;
      const belly = Math.sin(u * Math.PI) * Math.sin(v * Math.PI * 0.85 + 0.2) * bulge;
      row.push(m.verts.push([(u - 0.5) * w, v * h, belly]) - 1);
    }
    idx.push(row);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      addFace(m, [idx[r][c], idx[r][c + 1], idx[r + 1][c + 1], idx[r + 1][c]], color, { noCull: true });
    }
  }
  return m;
}

/** Triangular fore-and-aft sail (jib, staysail, lateen, spanker). */
export function makeTriSail(
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
  bulge: number, color: string, steps = 3,
): Mesh {
  const m = mesh();
  const lerp2 = (p: number[], q: number[], t: number) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const A = [ax, ay], B = [bx, by], C = [cx, cy];
  const rows: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = lerp2(A, B, t);
    const q = lerp2(A, C, t);
    const row: number[] = [];
    for (let j = 0; j <= steps; j++) {
      const s = i === 0 ? 0 : j / steps;
      const pt = lerp2(p, q, s);
      const belly = Math.sin(t * Math.PI) * Math.sin(s * Math.PI) * bulge;
      row.push(m.verts.push([pt[0], pt[1], belly]) - 1);
    }
    rows.push(row);
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      addFace(m, [rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]], color, { noCull: true });
    }
  }
  return m;
}

function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shadeHex(hex: string, k: number): string {
  const h = hex.replace('#', '');
  const r = clamp(parseInt(h.slice(0, 2), 16) * k, 0, 255);
  const g = clamp(parseInt(h.slice(2, 4), 16) * k, 0, 255);
  const b = clamp(parseInt(h.slice(4, 6), 16) * k, 0, 255);
  const to2 = (v: number) => ('0' + Math.round(v).toString(16)).slice(-2);
  return '#' + to2(r) + to2(g) + to2(b);
}

/** Planked deck — per-plank tone variation. */
export function makePlanks(w: number, d: number, plankCount: number, baseColor: string, seed: number): Mesh {
  const m = mesh();
  const rng = seededRandom(seed);
  for (let i = 0; i < plankCount; i++) {
    const z0 = -d / 2 + (d / plankCount) * i;
    const z1 = z0 + (d / plankCount) * 0.94;
    const b = m.verts.length;
    m.verts.push([-w / 2, 0, z0], [w / 2, 0, z0], [w / 2, 0, z1], [-w / 2, 0, z1]);
    // Wound so the normal points up.
    addFace(m, [b + 3, b + 2, b + 1, b], shadeHex(baseColor, 1 + (rng() - 0.5) * 0.16));
  }
  return m;
}

export interface Transform {
  pos?: [number, number, number];
  rotY?: number;
  rotZ?: number;
  scale?: number;
}

export function transformMesh(m: Mesh, t: Transform): Mesh {
  const pos = t.pos ?? [0, 0, 0];
  const rotY = t.rotY ?? 0;
  const rotZ = t.rotZ ?? 0;
  const s = t.scale ?? 1;
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  const cz = Math.cos(rotZ), sz = Math.sin(rotZ);
  const out: Mesh = { verts: [], faces: m.faces };
  for (const v of m.verts) {
    let x = v[0] * s, y = v[1] * s;
    const z = v[2] * s;
    const x2 = x * cz - y * sz;
    const y2 = x * sz + y * cz;
    x = x2; y = y2;
    out.verts.push([x * cy + z * sy + pos[0], y + pos[1], -x * sy + z * cy + pos[2]]);
  }
  return out;
}

/** Combine meshes into one, offsetting face indices. */
export function mergeMeshes(parts: Mesh[]): Mesh {
  const out = mesh();
  for (const p of parts) {
    const base = out.verts.length;
    for (const v of p.verts) out.verts.push(v);
    for (const f of p.faces) {
      out.faces.push({ i: f.i.map((i) => i + base), color: f.color, noCull: f.noCull });
    }
  }
  return out;
}
