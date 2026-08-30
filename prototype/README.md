# Prototype renderer

A small flat-shaded software renderer (canvas 2D, no dependencies) used to
produce the art direction and HUD mockups. **This is not the game engine** —
the playable build lives in `game/`.

It exists so the art direction is executable and reviewable rather than
described in prose, and so the lighting values in `GAME_DESIGN.md` are
grounded in something that actually renders.

> **Frozen reference.** The ship class and weather *tables* here are a
> snapshot — `game/src/data/` is the source of truth now; change values
> there. "Frozen" is about that data, not about this directory's job: it is
> still the mockup tool, and new pages (like `controls.html`, the
> look-directed camera/control scheme) get built here first, same as every
> page before it. The geometry is still the origin of the meshes the game
> builds, and the two should be kept visually in step.

## Files

| File | What it is |
| --- | --- |
| `lowpoly3d.js` | The renderer: perspective camera, mesh primitives, flat shading, distance haze, painter's-algorithm sorting |
| `ships.js` | Ship, island and prop assembly built from those primitives |
| `shipclasses.js` | The class roster — geometry and stats in one table, plus `buildClassShip()` |
| `weather.js` | Weather presets — sky, light rig, fog range, sea state and rain per condition |
| `scenes.js` | Shared palette + light rig, and every scene used in the mockups |
| `moodboard.src.html` | Art direction page (source, before font inlining) |
| `hud.src.html` | Combat HUD page (source, before font inlining) |
| `classes.src.html` | Ship classes page (source, before font inlining) |
| `weather.src.html` | Weather page (source, before font inlining) |
| `controls.src.html` | Camera & control scheme page — look-sector arcs, spread, mortar/swivel/brace/ram (source, before font inlining) |
| `build.py` | Inlines fonts and the JS above into standalone `.html` files |
| `make-fonts.sh` | Downloads and subsets the webfonts into `../fonts/fontfaces.css` |

Load order matters and is fixed by the token order in each `.src.html`:
`lowpoly3d.js` → `ships.js` → `shipclasses.js` → `weather.js` → `scenes.js`.
`ships.js` is deliberately free of any dependency on the class table, so the
renderer and the data tables stay separable.

## Building the pages

Both the built `.html` files and `../fonts/` are generated, and both are
gitignored. From a fresh clone:

```
bash prototype/make-fonts.sh   # writes ../fonts/fontfaces.css (needs fonttools + brotli)
python3 prototype/build.py     # writes moodboard.html, hud.html, classes.html, weather.html, controls.html
```

Fonts are subsetted to the glyphs the pages actually use — the full TTFs are
~900 KB together versus ~100 KB subsetted, and every published page carries a
complete copy inline. Published artifacts must be fully self-contained, so
nothing may reference an external URL.

## What carries over to Babylon.js

The renderer is deliberately structured around concepts that port directly:

- **Lighting** — ambient dominates the key (ambient ≈ 0.84, sun ≈ 0.48, with
  a wrapped lambert so unlit faces never crush). → `HemisphericLight` plus a
  low-intensity `DirectionalLight`.
- **Fog** — everything fades toward the horizon color with distance.
  → `scene.fogMode = FOGMODE_LINEAR` with `fogStart`/`fogEnd`. (This file
  previously said `FOGMODE_EXP`; linear is the correct match, because the
  renderer here fades with `smoothstep(start, end)`.)
- **Flat shading** — one fill per triangle.
  → `mesh.convertToFlatShadedMesh()`.
- **Waterline clipping** — *does not need porting at all.* Hulls are cut at
  the sea surface here purely because painter's-algorithm sorting cannot
  resolve a hull against huge ocean facets. A real depth buffer handles it,
  and the Babylon build in `game/` renders full hulls with no clip.

- **Class geometry** — `shipclasses.js` is plain data with no rendering in it,
  so the Babylon build should consume the same table rather than re-deriving
  hull dimensions. Keeping stats and geometry in one record is what stops the
  renders from disagreeing with the numbers printed next to them.

The scene definitions in `scenes.js` (camera framing, ship placement, palette)
are the reference the Babylon scenes should match.

## Sea state and foam

Whitecaps are driven by facet height: any ocean facet riding above a
threshold breaks into foam. Two details make it work rather than look like
floating ice.

Foam is rendered mostly **unlit** — breaking water scatters light instead of
reflecting the sky, so under a storm's low exposure a normally-shaded
whitecap would come out the same grey as the swell it broke off.

The thresholds are set from the **measured** height distribution rather than
guessed: per-cell average heights near the camera top out around 0.83 / 1.48
/ 2.35 for fair / squall / storm, so thresholds are placed to foam roughly
the top 5% / 10% / 18% of crests. Guessed values sat above the maximum and
produced no foam at all.

Oversized facets are skipped (`foamMaxCell`), and each weather's ocean sheet
is sized to its own fog distance — there is no point spending grid
resolution on water the haze has already swallowed.

## A note on viewing angles

Two of the scenes exist to test claims rather than to look good, and both ran
into the same geometric trap: square sails hang across the beam, so a dead
broadside view turns them edge-on and they vanish, while a bow-on view
foreshortens the hull length away. `sceneClassSilhouette` settles at ~55° off
axis, which keeps roughly 80% of the hull length and 58% of the sail area —
enough of both cues to tell the four classes apart in flat black.
