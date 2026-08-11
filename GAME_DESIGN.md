# Ship Combat — Game Design Doc

_Living document. This is the starting point for requirements — expect it to change as we iterate._

**Visual references (v0.2):**
- [Art Direction](https://claude.ai/code/artifact/7b0e04e4-4b83-4dff-acde-76258c5c2249) — key art, range tests, palette, and construction rules. Rendered live in 3D.
- [Combat HUD](https://claude.ai/code/artifact/3b0a7c9f-8096-49cf-9254-5d7af34e307d) — in-combat screen over the actual third-person camera framing.

## Overview

A browser-based, low-poly, artsy naval combat game. Players sail and fight
ships on the open ocean — broadside cannon volleys, wind-driven positioning,
and readable arcade combat in the spirit of *Assassin's Creed IV: Black
Flag*, but rendered in a simplified, stylized low-poly art style suited to
running directly in a web browser. Supports both PvP and PvE, with bots
able to fill either role.

## Pillars

- **Artsy, low-poly visuals** — flat-shaded geometry, a small deliberate
  color palette, no photorealism. Should look good even with very few
  polygons per ship.
- **Readable arcade naval combat** — combat decisions (angle, distance,
  timing) should be easy to read at a glance, even in a browser with modest
  hardware.
- **Approachable for PvP and PvE alike** — the same core combat loop should
  work whether the opponent is a human or a bot, and bots should be able to
  fill open PvP slots.

## Platform & Tech Stack

- **Target platform**: web browser, no install required.
- **Rendering engine**: [Babylon.js](https://www.babylonjs.com/) — WebGL,
  built-in physics (via its physics plugins), and a reasonable path toward
  multiplayer scaffolding.
- **Multiplayer/networking**: not yet decided. Will need a server-
  authoritative layer for fairness (e.g. Node.js + WebSockets, or a
  framework like Colyseus). Flagged as an open question below.
- **Bots**: server- or client-side AI opponents that can pilot ships using
  the same controls/combat rules as players, for PvE content and to fill
  PvP lobbies.

## Camera & Controls

- **Camera**: third-person, positioned behind and slightly above the ship
  (Black Flag-style), following the ship's heading.
- **Sailing**: heading/throttle control, with sail trim and speed affected
  by wind direction (upwind = slower, downwind = faster) — wind becomes a
  tactical element rather than just an aesthetic detail.
- **Combat**: broadside cannons fired left/right when an enemy is in arc;
  reload timers per side.
- **Stretch mechanics** (not committed, for later refinement):
  - Special ammo types (chain shot to damage sails/rigging, grapeshot vs.
    crew, round shot vs. hull).
  - Boarding and/or ramming as a secondary win condition.

## Core Combat Loop

1. Maneuver for a broadside firing angle while accounting for wind.
2. Trade cannon volleys; damage is tracked across separate systems:
   - **Hull integrity** — the main "health bar"; zero hull = sinking.
   - **Sail/rigging condition** — affects top speed and maneuverability.
   - (Stretch) **Crew** — affects reload speed / boarding viability.
3. Reposition, reload, repeat — or disengage if outmatched.
4. Sinking triggers a respawn (PvP) or defeat/loot state (PvE).

## Game Modes

- **PvP** — open-water skirmishes or bounded arena matches; small-scale
  (exact player count TBD).
- **PvE** — bot encounters, potentially scripted/boss-style engagements.
- **Bot-fill** — bots can occupy empty PvP slots so matches never feel
  under-populated.

## Art Direction

Settled: **bright daylight, clean and stylized low-poly** — a sunny
afternoon rather than a storm. The rules below are the spec the Babylon.js
build should reproduce; the mood board renders them live from real geometry.

- **Ambient dominates the sun.** Fill light carries roughly twice the key
  (ambient ≈ 0.84, sun ≈ 0.48, with a wrapped lambert term). Faces turned
  away from the sun stay bright and colorful — nothing crushes to black.
  This is what makes the look airy instead of dramatic.
  → Babylon: `HemisphericLight` + a low-intensity `DirectionalLight`.
- **Distance haze does the depth work.** Everything fades toward the
  horizon color with distance, replacing detail and selling scale.
  → Babylon: `scene.fogMode = FOGMODE_EXP` tuned to the horizon color.
- **Flat facets, no gradients.** One flat fill per triangle; shape reads
  from the angle between neighboring facets.
  → Babylon: flat/faceted normals (`mesh.convertToFlatShadedMesh()`).
- **Faceted water, damped by distance.** Waves are displaced geometry,
  choppy near camera and flattening toward the horizon.
- **Chunky silhouettes.** A ship is a hull, a mast, and two or three
  sails. If it isn't recognizable at minimap size, it has too many parts.
- **Cut at the waterline.** Hulls are clipped where they meet the sea so
  ships sit *in* the water rather than on it.

Palette (per scene, five hues plus a reserved accent): sea `#2F97B8`,
crest `#7ED6DD`, haze `#D8E8F2`, hull `#A5662F`, deck `#D3A05A`, sail
`#F4ECD8`, accent `#E2A84F`. Ship identity comes from hull/sail tone —
distinct enough to tell friend from foe at range.

`prototype/` holds the small flat-shading renderer used for the mockups.
It is not the game engine — it exists so the art direction is executable
and reviewable, and so the values above are grounded in something real.

## Progression / Meta (placeholder)

Not yet designed. Candidate ideas to revisit later: ship classes with
different stats, cosmetic customization (sails, flags, hull paint),
unlockable ammo types. No commitments yet.

## Open Questions

- [ ] Networking approach for multiplayer (authoritative server tech,
      tick rate, rollback/interpolation strategy).
- [ ] Ship roster size and differentiation at launch (one ship class vs.
      several).
- [ ] Target session length for a PvP match.
- [x] ~~Overall art tone~~ — resolved: bright daylight stylized low-poly
      (see Art Direction above).
- [ ] How far ship customization can push the palette before scenes stop
      reading as one game.
- [ ] Monetization / progression systems — in scope for the mockup phase
      at all, or purely post-MVP?
- [ ] Minimum player count per match, and how bots fill gaps (matchmaking
      timeout, always-on bots, etc.).
