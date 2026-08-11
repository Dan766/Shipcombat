# Ship Combat — playable slice

A Babylon.js build you can sail. Sailing only: no cannons, no damage, no
sinking. It exists to answer questions that mockups cannot — how the sailing
model feels, and whether the art direction survives contact with a real
engine.

```
npm install
npm run dev          # http://127.0.0.1:5173
```

**Controls** — `A`/`D` steer · `W`/`S` sail trim · `C` cycle class ·
`1`–`5` weather · `V` cycle simulated latency.

## The one architectural rule

**The simulation never imports Babylon, and the renderer never mutates
simulation state.**

Everything else follows from that. It is enforced by `npm run check:layering`,
which fails the build if an engine import appears in `src/sim`, `src/data` or
`src/net`. If that check ever goes red, the simulation can no longer run on a
server and "structured for multiplayer" has quietly stopped being true.

```
input → Command ─┐                          ┌─ Snapshot → interp buffer → render
                 └→ Transport → World.step()┘
```

| Layer | What it is | Engine-free |
| --- | --- | --- |
| `src/sim` | Authoritative world. Fixed 30 Hz, advances only from commands. | yes |
| `src/data` | Ship class and weather tables. Source of truth. | yes |
| `src/net` | `Transport` seam plus the client's interpolation buffer. | yes |
| `src/render` | Babylon scene, meshes, ocean, sky. | no |
| `src/input` | Keyboard → `Command`. Never touches world state. | no |

`LocalTransport` runs the simulation in this same process, but commands and
snapshots still cross the interface **and are delayed by a configurable
latency** (default 80 ms). That delay is deliberate: at zero latency the
interpolation buffer is never exercised, the seams rot unnoticed, and every
problem surfaces on the day real networking arrives instead of today.

Swapping in a real server means writing a `WebSocketTransport` that satisfies
the same interface. Nothing in `src/render` or `src/input` should need to
change.

### What is deliberately not done yet

- **Client-side prediction and reconciliation.** The client renders the
  server's authoritative state with interpolation only, so at 80 ms the
  controls feel slightly heavy. That is the honest baseline prediction gets
  measured against later, and it belongs in `src/net/interpolator.ts` on top
  of what is there — not instead of it.
- **Animated water.** The sea is static geometry. Animating it means
  rebuilding ~70k vertices per frame in JS, which would measure the cost of
  vertex updates rather than the cost of the art direction. It belongs in a
  vertex shader.
- **Bots with real AI.** The second ship steers a constant turn. It exists so
  the snapshot path carries more than one entity.

## Verification

```
npm run verify        # typecheck + layering + determinism (no browser needed)
npm run dev           # in one shell
npm run verify:render # in another — drives a real browser over CDP
```

`verify:render` reports frame time per weather state, confirms every class
builds, checks that ships travel along their heading (a rotation sign error
reads as a ship gliding backwards, which is easy to miss from astern), and
measures interpolation smoothness at 0 / 80 / 150 ms latency. Pass
`--shots <dir>` to write screenshots.

**On the framerate numbers:** in a container this runs on SwiftShader, a
software rasteriser, where the scene measures ~9–13 fps. That is a floor, not
a prediction — it says nothing about real hardware. The transferable number is
the geometry budget: **~86k vertices / ~29k triangles / 3–4 draw calls** for
the full scene including the ocean. That is a very light scene by GPU
standards, but **the 60 fps target has not actually been verified on a real
GPU** and should be, on a real machine, before the art direction is treated as
settled.

## Relationship to `prototype/`

`prototype/` is the software renderer that produced the mockups. It is a
frozen art reference and is no longer maintained. The geometry in
`src/render/geometry.ts` and `src/render/shipMesh.ts` is a transliteration of
it, so ships here are the same shapes as the ships in the mockups.

The one thing not carried over is the waterline hull clip. That existed only
because a painter's-algorithm renderer cannot sort a hull against huge ocean
facets; Babylon has a depth buffer, so the opaque ocean hides the submerged
hull correctly on its own.
