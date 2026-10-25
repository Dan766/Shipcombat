# Ship Combat — playable slice

A Babylon.js build you can sail and fight in. It exists to answer questions
mockups cannot — how the sailing and gunnery models feel, and whether the art
direction survives contact with a real engine.

```
npm install
npm run dev          # http://127.0.0.1:5173
```

**Controls**

| | |
| --- | --- |
| mouse (click canvas to lock) | Free-look camera — yaw/pitch, 360° |
| `A` / `D` | Steer |
| `W` / `S` | Sail trim |
| LMB | Fire whatever the look direction currently arms |
| RMB (hold) | Aim — narrows volley spread over ~1s |
| `R` | Toggle round / chain shot |
| wheel, `[` `]` | Aim range (25–250 m) |
| `C` | Cycle ship class |
| `1`–`5` | Weather |
| `V` | Cycle simulated latency |

Where the camera looks picks the armed weapon — bow chasers dead ahead,
broadsides abeam, the stern drop weapon astern, each with its own reload
(`game/src/sim/lookSector.ts`). Broadsides are still fixed batteries: you
cannot swing them across the bow, the reticle sets *range*, and bearing comes
from steering the ship. Bow chasers are the only way to hit a target dead
ahead, and always load chain.

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
| `src/input` | Keyboard & mouse → `Command`. Never touches world state. | no |

`LocalTransport` runs the simulation in this same process, but commands and
snapshots still cross the interface **and are delayed by a configurable
latency** (default 80 ms). That delay is deliberate: at zero latency the
interpolation buffer is never exercised, the seams rot unnoticed, and every
problem surfaces on the day real networking arrives instead of today.

Swapping in a real server means writing a `WebSocketTransport` that satisfies
the same interface. Nothing in `src/render` or `src/input` should need to
change.

### Firing and latency

Pressing fire plays the muzzle flash and smoke **immediately**, while the
authoritative volley arrives ~160 ms later and is what actually flies. There
is deliberately no predicted cannonball: a fake ball that then diverges from
the server's is more jarring than the delay it hides, and almost all of the
perceptual win is in the flash answering the keypress.

Fire orders are edge-triggered and survive command coalescing. Whenever the
client's command rate outruns the tick rate — any time framerate drops below
30 fps — several commands land between two ticks, and naively keeping only the
newest silently swallows the shot. `World.applyCommand` merges instead, taking
the newest steering but preserving a pending fire.

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
- **Grape shot and a crew damage track.** Two ammo types are in; grape needs
  a crew system to act on first.
- **Mortars, swivel guns, brace, and a ram dash.** All held-modifier or
  defensive mechanics the look-directed scheme's mockup proposes
  (see `GAME_DESIGN.md`'s Camera & Controls section) but none are built.
- **Boarding and ramming.** No collision between hulls at all yet — ships
  pass through each other. Ramming specifically depends on this.
- **The AI using bow chasers or the drop weapon.** `src/sim/bot.ts` still
  only ever fires broadsides.
- **More than one opponent, and matchmaking.**
- **A minimap**, which the HUD mockup specifies but nothing populates yet.

## Verification

```
npm run verify        # typecheck + layering + determinism + combat (no browser)
npm run dev           # in one shell
npm run verify:render # in another — drives a real browser over CDP
```

`npm run verify` is the no-browser gate: typecheck, layering, determinism and
combat behaviour.

`test:combat` asserts the things that would otherwise only surface by playing
— shots land where they are aimed, a target dead ahead cannot be hit by a
broadside but can by bow chasers, chain shot wrecks rigging while round shot
sinks hulls, rigging damage measurably slows a ship, hulls sink and respawn,
fire orders survive command coalescing, the drop weapon damages a ship within
its blast radius and not one outside it, the look-directed sector arcs tile
360° with no flicker at the seams, and the AI actually lands hits rather than
merely firing.

`test:determinism` replays a 60-second **duel** — with volleys, hits and a
sinking — and compares state hashes. Projectiles and reload timers are exactly
the state that drifts, so the fight is what gets hashed, and the check fails if
the duel was vacuous.

`verify:render` reports frame time per weather state, confirms every class
builds, checks that ships travel along their heading (a rotation sign error
reads as a ship gliding backwards, which is easy to miss from astern),
measures interpolation smoothness at 0 / 80 / 150 ms, and fires broadsides to
confirm projectiles reach the screen. Pass `--shots <dir>` to write
screenshots.

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
