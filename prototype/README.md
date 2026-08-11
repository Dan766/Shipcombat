# Prototype renderer

A small flat-shaded software renderer (canvas 2D, no dependencies) used to
produce the art direction and HUD mockups. **This is not the game engine** —
the game targets Babylon.js. This exists so the art direction is executable
and reviewable rather than described in prose, and so the lighting values in
`GAME_DESIGN.md` are grounded in something that actually renders.

## Files

| File | What it is |
| --- | --- |
| `lowpoly3d.js` | The renderer: perspective camera, mesh primitives, flat shading, distance haze, painter's-algorithm sorting |
| `ships.js` | Ship, island and prop assembly built from those primitives |
| `scenes.js` | Shared palette + light rig, and the four scenes used in the mockups |
| `moodboard.src.html` | Art direction page (source, before font inlining) |
| `hud.src.html` | Combat HUD page (source, before font inlining) |
| `build.py` | Inlines fonts and the JS above into standalone `.html` files |

## Building the pages

`build.py` expects subsetted woff2 fonts as a `../fonts/fontfaces.css` file of
`@font-face` rules with base64 data URIs (Fraunces, Work Sans, IBM Plex Mono).
The published artifacts must be fully self-contained — no external requests.

```
python3 build.py     # writes moodboard.html and hud.html
```

## What carries over to Babylon.js

The renderer is deliberately structured around concepts that port directly:

- **Lighting** — ambient dominates the key (ambient ≈ 0.84, sun ≈ 0.48, with
  a wrapped lambert so unlit faces never crush). → `HemisphericLight` plus a
  low-intensity `DirectionalLight`.
- **Fog** — everything fades toward the horizon color with distance.
  → `scene.fogMode = FOGMODE_EXP`.
- **Flat shading** — one fill per triangle.
  → `mesh.convertToFlatShadedMesh()`.
- **Waterline clipping** — hulls are cut at the sea surface so ships sit in
  the water. Here it is a world-space polygon clip; in Babylon this is better
  done with a clip plane or by authoring hulls that end at the waterline.

The scene definitions in `scenes.js` (camera framing, ship placement, palette)
are the reference the Babylon scenes should match.
