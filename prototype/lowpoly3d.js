/* ------------------------------------------------------------------
   lowpoly3d — a tiny flat-shaded software renderer.

   Exists so the mockups are real 3D renders rather than 2D drawings:
   perspective camera, per-face lambert + hemisphere ambient, distance
   haze, painter's-algorithm sorting. Everything here maps 1:1 onto
   Babylon.js concepts later (meshes, StandardMaterial w/ flat normals,
   a DirectionalLight + HemisphericLight, and scene.fogMode EXP).
   ------------------------------------------------------------------ */

/* ---------- vector helpers ---------- */

function v3(x, y, z) { return [x, y, z]; }
function vsub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function vcross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function vnorm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/* ---------- color helpers ---------- */

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToCss(c) {
  return 'rgb(' + Math.round(clamp(c[0], 0, 255)) + ',' + Math.round(clamp(c[1], 0, 255)) + ',' + Math.round(clamp(c[2], 0, 255)) + ')';
}
function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- mesh primitives ----------
   A mesh is { verts: [[x,y,z]...], faces: [{ i:[...], color, noCull, alpha }] }
   Meshes are authored around the origin; `pos`, `rotY` and `scale` place them.  */

function mesh() { return { verts: [], faces: [] }; }

function addFace(m, indices, color, opts) {
  const f = { i: indices, color: color };
  if (opts) {
    if (opts.noCull) f.noCull = true;
    if (opts.alpha != null) f.alpha = opts.alpha;
    if (opts.jitter != null) f.jitter = opts.jitter;
  }
  m.faces.push(f);
}

// Box with its base on y=0, centered in x/z.
function makeBox(w, h, d, color) {
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

// N-sided prism (masts, trunks, bollards), base on y=0.
function makePrism(rBottom, rTop, h, sides, color) {
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
  const top = [];
  for (let i = 0; i < sides; i++) top.push(sides + i);
  addFace(m, top, color);
  return m;
}

// Faceted dome — islands, rocks, tree canopies.
function makeDome(r, h, seg, rings, color, seed, rough) {
  const m = mesh();
  const rng = seededRandom(seed || 1);
  rough = rough == null ? 0.18 : rough;
  const rows = [];
  for (let ri = 0; ri <= rings; ri++) {
    const t = ri / rings;
    const y = Math.sin(t * Math.PI / 2) * h;
    const rad = Math.cos(t * Math.PI / 2) * r;
    const row = [];
    for (let si = 0; si < seg; si++) {
      const a = (si / seg) * Math.PI * 2;
      const jit = 1 + (rng() - 0.5) * rough;
      row.push(m.verts.push([
        Math.cos(a) * rad * jit,
        y * (1 + (rng() - 0.5) * rough * 0.6),
        Math.sin(a) * rad * jit,
      ]) - 1);
    }
    rows.push(row);
  }
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < seg; si++) {
      const sj = (si + 1) % seg;
      if (ri === rings - 1) {
        addFace(m, [rows[ri][si], rows[ri][sj], rows[ri + 1][si]], color, { jitter: 0.05 });
      } else {
        addFace(m, [rows[ri][si], rows[ri][sj], rows[ri + 1][sj], rows[ri + 1][si]], color, { jitter: 0.05 });
      }
    }
  }
  return m;
}

// Lofted hull: two closed rings (deck outline and narrower keel line)
// skinned with quads, then capped with a deck.
// The hull's plan view, as fractions of length and beam. Shared so anything
// that needs to sit ON the hull (gun ports, fenders) can ask where the
// planking actually is instead of assuming a box.
const HULL_PROFILE = [
  [0.50, 0.00], [0.42, 0.26], [0.26, 0.44], [0.02, 0.50],
  [-0.24, 0.48], [-0.44, 0.38], [-0.50, 0.20],
  [-0.50, -0.20], [-0.44, -0.38], [-0.24, -0.48], [0.02, -0.50],
  [0.26, -0.44], [0.42, -0.26],
];

const KEEL_TAPER_DEFAULT = 0.42;

// Half-width of the hull at a given fraction of length, as a fraction of beam
// (0 at the very bow, 0.5 amidships). Linear interpolation along the
// positive-z side of the profile.
function hullHalfWidthFrac(xFrac) {
  const pts = HULL_PROFILE.filter(function (p) { return p[1] >= 0; });
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

// Where the hull surface sits at a point on it, in world units, accounting for
// both the plan taper and the keel taper below deck level.
function hullSurfaceZ(xFrac, y, beam, depth, keelTaper) {
  const kt = keelTaper == null ? KEEL_TAPER_DEFAULT : keelTaper;
  const vert = kt + (1 - kt) * clamp(y / depth, 0, 1);
  return hullHalfWidthFrac(xFrac) * beam * vert;
}

function makeHull(len, beam, depth, deckColor, hullColor, opts) {
  const m = mesh();
  opts = opts || {};
  const profile = HULL_PROFILE;
  const n = profile.length;
  for (let i = 0; i < n; i++) {
    m.verts.push([profile[i][0] * len, depth, profile[i][1] * beam]);
  }
  const keelTaper = opts.keelTaper == null ? 0.42 : opts.keelTaper;
  const keelRise = opts.keelRise == null ? 0 : opts.keelRise;
  for (let i = 0; i < n; i++) {
    // Sheer: bow and stern lift out of the water so the keel line curves
    // instead of reading as a flat-bottomed box.
    const fore = Math.abs(profile[i][0]) * 2;
    m.verts.push([profile[i][0] * len * 0.94, keelRise * fore * fore, profile[i][1] * beam * keelTaper]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    addFace(m, [i, j, n + j, n + i], hullColor, { jitter: 0.04 });
  }
  if (!opts.noCap) {
    const deck = [];
    for (let i = 0; i < n; i++) deck.push(i);
    addFace(m, deck, deckColor);
  }
  return m;
}

// Triangular fore-and-aft sail (jib / staysail), authored in the x-y plane
// so it hangs in the ship's centerline. Double-sided.
function makeTriSail(ax, ay, bx, by, cx2, cy2, bulge, color, steps) {
  steps = steps || 3;
  const m = mesh();
  const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const A = [ax, ay], B = [bx, by], C = [cx2, cy2];
  const rows = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = lerp2(A, B, t);
    const q = lerp2(A, C, t);
    const row = [];
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
      addFace(m, [rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]], color, { noCull: true, jitter: 0.04 });
    }
  }
  return m;
}

// Billowed sail — a bulged quad grid, rendered double-sided.
function makeSail(w, h, bulge, color, cols, rows) {
  cols = cols || 4; rows = rows || 4;
  const m = mesh();
  const idx = [];
  for (let r = 0; r <= rows; r++) {
    const row = [];
    for (let c = 0; c <= cols; c++) {
      const u = c / cols, vv = r / rows;
      const belly = Math.sin(u * Math.PI) * Math.sin(vv * Math.PI * 0.85 + 0.2) * bulge;
      row.push(m.verts.push([(u - 0.5) * w, vv * h, belly]) - 1);
    }
    idx.push(row);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      addFace(m, [idx[r][c], idx[r][c + 1], idx[r + 1][c + 1], idx[r + 1][c]], color, { noCull: true, jitter: 0.05 });
    }
  }
  return m;
}

// Planked deck surface — per-plank tone variation, the detail that reads
// as "hand-built" in the reference art.
function makePlanks(w, d, plankCount, baseColor, seed) {
  const m = mesh();
  const rng = seededRandom(seed || 3);
  const base = hexToRgb(baseColor);
  for (let i = 0; i < plankCount; i++) {
    const z0 = -d / 2 + (d / plankCount) * i;
    const z1 = z0 + (d / plankCount) * 0.94;
    const b = m.verts.length;
    m.verts.push([-w / 2, 0, z0], [w / 2, 0, z0], [w / 2, 0, z1], [-w / 2, 0, z1]);
    const shade = 1 + (rng() - 0.5) * 0.16;
    // Wound so the face normal points up — the reverse order back-face culls.
    addFace(m, [b + 3, b + 2, b + 1, b], rgbToCss(base.map(function (v) { return v * shade; })));
  }
  return m;
}

function makeTree(trunkH, canopyR, trunkColor, leafColor, seed) {
  const parts = [];
  parts.push({ mesh: makePrism(0.16, 0.12, trunkH, 5, trunkColor), pos: [0, 0, 0] });
  parts.push({ mesh: makeDome(canopyR, canopyR * 1.25, 7, 3, leafColor, seed, 0.3), pos: [0, trunkH * 0.82, 0] });
  return parts;
}

/* ---------- transforms ---------- */

function transformMesh(m, opts) {
  const pos = opts.pos || [0, 0, 0];
  const rotY = opts.rotY || 0;
  const rotZ = opts.rotZ || 0;
  const s = opts.scale == null ? 1 : opts.scale;
  const sx = opts.scaleX == null ? s : opts.scaleX;
  const sy = opts.scaleY == null ? s : opts.scaleY;
  const sz = opts.scaleZ == null ? s : opts.scaleZ;
  const cy = Math.cos(rotY), sy2 = Math.sin(rotY);
  const cz = Math.cos(rotZ), sz2 = Math.sin(rotZ);
  const out = { verts: [], faces: m.faces };
  for (let i = 0; i < m.verts.length; i++) {
    let x = m.verts[i][0] * sx, y = m.verts[i][1] * sy, z = m.verts[i][2] * sz;
    let x2 = x * cz - y * sz2, y2 = x * sz2 + y * cz;
    x = x2; y = y2;
    const x3 = x * cy + z * sy2;
    const z3 = -x * sy2 + z * cy;
    out.verts.push([x3 + pos[0], y + pos[1], z3 + pos[2]]);
  }
  return out;
}

/* ---------- ocean ----------
   Quadratic cell spacing keeps triangle count sane while still reaching the
   horizon: dense facets near the camera, huge flat ones far away. Wave
   amplitude damps with distance so the far water reads as calm haze. */

function makeOcean(opts) {
  const { halfSize, cells, color, crest, seed } = opts;
  const m = mesh();
  const rng = seededRandom(seed || 11);
  const base = hexToRgb(color);
  const crestRgb = hexToRgb(crest);
  const coord = [];
  for (let i = 0; i <= cells; i++) {
    const u = (i / cells) * 2 - 1;
    coord.push(Math.sign(u) * Math.pow(Math.abs(u), 2.2) * halfSize);
  }
  const amp = opts.amp == null ? 1 : opts.amp;
  const height = function (x, z) {
    const d = Math.hypot(x, z);
    const damp = 1 / (1 + d * 0.012);
    return (Math.sin(x * 0.19 + z * 0.13) * 0.62 + Math.sin(x * 0.08 - z * 0.27) * 0.44 + Math.sin(z * 0.44 + x * 0.05) * 0.24) * damp * amp;
  };
  const grid = [];
  for (let i = 0; i <= cells; i++) {
    const row = [];
    for (let j = 0; j <= cells; j++) {
      const x = coord[i], z = coord[j];
      row.push(m.verts.push([x, height(x, z), z]) - 1);
    }
    grid.push(row);
  }
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
      const avgY = (m.verts[a][1] + m.verts[b][1] + m.verts[c][1] + m.verts[d][1]) / 4;
      const t = clamp(avgY * 0.55 + 0.5, 0, 1) * 0.5 + rng() * 0.12;
      const col = rgbToCss(mixRgb(base, crestRgb, t));
      addFace(m, [a, b, c], col);
      addFace(m, [a, c, d], col);
    }
  }
  return m;
}

/* ---------- renderer ---------- */

// Clip a world-space polygon to the half-space y >= k. Used to slice hulls
// off at the waterline: painter's-algorithm sorting cannot resolve a hull
// bottom against the huge ocean facets around it, so the submerged part is
// removed outright rather than sorted.
function clipAboveY(poly, k) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const aIn = a[1] >= k, bIn = b[1] >= k;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (k - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, k, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

function clipNear(poly, near) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const aIn = a[2] >= near, bIn = b[2] >= near;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (near - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near]);
    }
  }
  return out;
}

function drawSkyGradient(ctx, w, h, sky) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, sky.top);
  g.addColorStop(0.62, sky.mid);
  g.addColorStop(1, sky.horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// Soft polygonal clouds, drawn in screen space — they sit far enough away
// that parallax would not read anyway.
function drawClouds(ctx, w, h, clouds, color) {
  ctx.save();
  for (const c of clouds) {
    const cx = c.x * w, cy = c.y * h, s = c.s * w;
    const rng = seededRandom(c.seed || 5);
    ctx.globalAlpha = c.alpha == null ? 0.9 : c.alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < 5; i++) {
      const ox = (rng() - 0.5) * s * 1.5;
      const oy = (rng() - 0.5) * s * 0.28;
      const rx = s * (0.28 + rng() * 0.3);
      const ry = rx * (0.42 + rng() * 0.2);
      ctx.beginPath();
      const pts = 7;
      for (let p = 0; p < pts; p++) {
        const a = (p / pts) * Math.PI * 2;
        const jr = 1 + (rng() - 0.5) * 0.35;
        const px = cx + ox + Math.cos(a) * rx * jr;
        const py = cy + oy + Math.sin(a) * ry * jr;
        if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function renderScene(canvas, scene) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  if (!w || !h) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawSkyGradient(ctx, w, h, scene.sky);
  if (scene.clouds) drawClouds(ctx, w, h, scene.clouds, scene.sky.cloud || '#ffffff');

  const cam = scene.camera;
  const eye = cam.eye;
  const fwd = vnorm(vsub(cam.target, eye));
  const right = vnorm(vcross(fwd, [0, 1, 0]));
  const up = vcross(right, fwd);
  const fov = (cam.fov || 55) * Math.PI / 180;
  const focal = (h / 2) / Math.tan(fov / 2);
  const cx = w / 2, cy = h / 2;
  const near = 0.35;

  const sun = vnorm(scene.sun.dir);
  const sunColor = hexToRgb(scene.sun.color || '#fff6e0');
  const skyFill = hexToRgb(scene.sun.skyFill || '#e2eefa');
  const groundFill = hexToRgb(scene.sun.groundFill || '#a9a79b');
  const ambient = scene.sun.ambient == null ? 0.82 : scene.sun.ambient;
  const strength = scene.sun.strength == null ? 0.46 : scene.sun.strength;
  const haze = hexToRgb(scene.fog.color);

  const buckets = [];

  const toCamSpace = function (p) {
    const rel = vsub(p, eye);
    return [vdot(rel, right), vdot(rel, up), vdot(rel, fwd)];
  };

  for (const item of scene.meshes) {
    const m = item.transform ? transformMesh(item.mesh, item.transform) : item.mesh;
    for (const f of m.faces) {
      const worldFull = f.i.map(function (ix) { return m.verts[ix]; });
      // Shade from the untrimmed face so clipping never changes the normal.
      const n = vnorm(vcross(vsub(worldFull[1], worldFull[0]), vsub(worldFull[2], worldFull[0])));
      const world = item.clipBelow != null ? clipAboveY(worldFull, item.clipBelow) : worldFull;
      if (world.length < 3) continue;

      const camPoly = world.map(toCamSpace);
      let depth = 0;
      for (const p of camPoly) depth += p[2];
      depth /= camPoly.length;
      if (depth < near * 0.5) continue;
      let nn = n;
      if (f.noCull) {
        const toCam = vsub(eye, world[0]);
        if (vdot(n, toCam) < 0) nn = [-n[0], -n[1], -n[2]];
      } else {
        const camN = vcross(vsub(camPoly[1], camPoly[0]), vsub(camPoly[2], camPoly[0]));
        if (vdot(camN, camPoly[0]) > 0) continue;
      }

      // Soft, sunny key: a wrapped lambert term keeps faces turned away from
      // the sun from crushing to black, and a hemisphere ambient does most of
      // the lifting — the airy look depends on ambient dominating the key.
      // Sailcloth is thin: a backlit sail still reads bright, so double-sided
      // faces take |N·L| rather than clamping the back face to shadow.
      const raw = f.noCull ? Math.abs(vdot(nn, sun)) : vdot(nn, sun);
      const wrap = scene.sun.wrap == null ? 0.35 : scene.sun.wrap;
      const lambert = clamp((raw + wrap) / (1 + wrap), 0, 1);
      const hemi = 0.5 + 0.5 * nn[1];
      const ambientRgb = mixRgb(groundFill, skyFill, hemi);
      const col = hexToRgb(f.color.charCodeAt(0) === 114 ? rgbCssToHex(f.color) : f.color);
      const lit = [
        col[0] * (ambientRgb[0] / 255 * ambient + sunColor[0] / 255 * strength * lambert),
        col[1] * (ambientRgb[1] / 255 * ambient + sunColor[1] / 255 * strength * lambert),
        col[2] * (ambientRgb[2] / 255 * ambient + sunColor[2] / 255 * strength * lambert),
      ];
      const fogT = smoothstep(scene.fog.start, scene.fog.end, depth);
      let final = mixRgb(lit, haze, fogT);
      if (f.jitter) {
        const k = 1 + (((f.i[0] * 37 + f.i[1] * 17) % 100) / 100 - 0.5) * f.jitter;
        final = [final[0] * k, final[1] * k, final[2] * k];
      }

      buckets.push({
        depth: depth,
        poly: camPoly,
        color: rgbToCss(final),
        alpha: item.alphaOverride != null ? item.alphaOverride : f.alpha,
      });
    }
  }

  buckets.sort(function (a, b) { return b.depth - a.depth; });

  for (const b of buckets) {
    const clipped = clipNear(b.poly, near);
    if (clipped.length < 3) continue;
    ctx.beginPath();
    for (let i = 0; i < clipped.length; i++) {
      const p = clipped[i];
      const sx = cx + (p[0] / p[2]) * focal;
      const sy = cy - (p[1] / p[2]) * focal;
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.globalAlpha = b.alpha == null ? 1 : b.alpha;
    ctx.fillStyle = b.color;
    ctx.fill();
    // Hairline stroke in the fill color closes the seams between adjacent
    // facets that antialiasing would otherwise leave as light cracks. Skipped
    // on translucent faces, where it would double-composite into an outline.
    if (b.alpha == null || b.alpha >= 1) {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function rgbCssToHex(css) {
  const m = css.match(/\d+/g);
  return '#' + m.slice(0, 3).map(function (v) {
    return ('0' + clamp(parseInt(v, 10), 0, 255).toString(16)).slice(-2);
  }).join('');
}
