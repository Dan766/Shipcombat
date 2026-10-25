# Ship Combat — Game Design Doc

_Living document. This is the starting point for requirements — expect it to change as we iterate._

**Visual references:**
- [Art Direction](https://claude.ai/code/artifact/7b0e04e4-4b83-4dff-acde-76258c5c2249) — key art, range tests, palette, and construction rules. Rendered live in 3D.
- [Combat HUD](https://claude.ai/code/artifact/3b0a7c9f-8096-49cf-9254-5d7af34e307d) — in-combat screen over the actual third-person camera framing.
- [Ship Classes](https://claude.ai/code/artifact/a8cf2458-6788-4f9a-bf19-f927bc6f50d3) — the four-class roster at true relative scale, with stats and a silhouette readability test.
- [Weather](https://claude.ai/code/artifact/c1bf5d5a-2a5a-4e57-a3f6-4d2758fa89c3) — five sea states, the same shot under each, with their gameplay effects.
- [Camera & Controls](https://claude.ai/code/artifact/7d30beea-d355-41af-8f40-28659deb5e3c) — look-directed weapon select: sector arcs, hold-to-aim spread. Shipped in `game/`; mortar/swivel/brace/ram are still mockup-only (see below).

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
- **Multiplayer/networking**: architecture decided, wire not yet built. The
  simulation is authoritative and engine-free, running at a fixed 30 Hz
  behind a `Transport` seam; the client sends commands and renders
  interpolated snapshots. Today that transport runs in-process with
  simulated latency. See Implementation below.
- **Bots**: server- or client-side AI opponents that can pilot ships using
  the same controls/combat rules as players, for PvE content and to fill
  PvP lobbies.

## Camera & Controls

**Look-directed weapon select** — shipped in `game/`. The direction the
camera looks picks the armed weapon. Broadsides stay **fixed batteries** —
steering is still what aims them, the rule the whole duel rests on — but the
camera is free-look, the bow and stern have their own armaments, and holding
aim turns the volley spread from a constant into something the player
controls. Full scheme, HUD mockups and the control map (mortar/swivel/
brace/ram included, still not built — see below):
[Camera & Controls](https://claude.ai/code/artifact/7d30beea-d355-41af-8f40-28659deb5e3c).

- **Camera**: free-look, 360° orbit, pointer-locked to the mouse
  (`game/src/input/mouse.ts`). Camera yaw relative to heading, θ, selects the
  armed weapon (`game/src/sim/lookSector.ts`):

  | Sector | Arc | Armament |
  | --- | --- | --- |
  | Bow | \|θ\| ≤ 30° | Bow chasers — 2 guns, fast reload, always chain |
  | Starboard | 30° < θ < 150° | Starboard broadside |
  | Port | -150° < θ < -30° | Port broadside |
  | Stern | \|θ\| ≥ 150° | Drop weapon — one fire-barrel charge |

  Arcs tile 360° exactly, with 4° of hysteresis at each boundary so a camera
  resting on a seam does not flicker the armed weapon — asserted by
  `game/scripts/combat-tests.ts`. Mortars and swivel guns remain
  held-modifier modes available from any look direction — not sectors — and
  are not built.
- **Two HUD elements the scheme requires that free-look breaks otherwise**:
  an **off-screen target indicator** — a camera-relative arrow pinned to
  whichever edge the target has fallen off, since a free camera no longer
  auto-swings toward the fight — and a **heading ribbon** across the top, so
  steering stays legible while looking abeam. Both in `game/src/render/hud.ts`.
- **Sailing**: heading/throttle control, with sail trim and speed affected
  by wind direction (upwind = slower, downwind = faster) — wind becomes a
  tactical element rather than just an aesthetic detail. Wind *strength*
  varies by weather (see Weather below), so the same heading is worth
  different speed in different conditions. Three named sail presets (stop /
  half / full) make the existing turn-rate falloff (`TURN_SPEED_FALLOFF`,
  `game/src/sim/world.ts`) legible rather than adding a new mechanic.
- **Combat**: fire the currently-armed weapon with LMB; hold RMB to aim,
  which narrows the volley spread (see Gunnery below). Camera is free to
  swing away the instant a shot is fired.
- **Designed, not built**: mortars (indirect fire), swivel guns (precision
  hits on weak points and powder kegs), brace (damage mitigation,
  telegraphed by glowing gun ports on a ship that has a full reload and you
  in arc), and a ram dash. Ramming specifically needs hull-to-hull
  collision, which does not exist yet — `game/README.md` lists it as
  deliberately deferred, and it is the single largest follow-on cost this
  scheme creates. The enemy AI (`game/src/sim/bot.ts`) also doesn't use any
  of the new mounts yet — it stays broadside-only.
- **Stretch, still undesigned**: grapeshot (needs a crew system to act on
  first), boarding.

## Core Combat Loop

1. Maneuver for a broadside firing angle while accounting for wind.
2. Trade cannon volleys; damage is tracked across separate systems:
   - **Hull integrity** — the main "health bar"; zero hull = sinking.
   - **Rigging condition** — scales speed and turn rate by
     `0.35 + 0.65 x rig`, so a shredded ship still drifts but cannot run.
   - (Deferred) **Crew** — would affect reload speed and boarding.
3. Reposition, reload, repeat — or disengage if outmatched.
4. Sinking triggers a respawn (PvP) or defeat/loot state (PvE).

### Gunnery

Guns are **fixed broadside batteries**. They cannot be swung — you turn the
ship. The only thing the gunner controls is elevation, which sets range, and
that is deliberately the whole point: a duel is decided by steering, not by
mouse aim. A target dead ahead simply cannot be shot.

- Muzzle velocity **65 m/s** under 9.81 gravity; elevation is the low-angle
  solution of `R = v² sin(2θ)/g`. Effective range capped at **250 m**.
- A volley fires every gun on the chosen side with a small bearing and range
  spread, so it lands as a pattern rather than a point.
- **Round shot** puts everything into the hull. **Chain shot** wrecks rigging
  and barely scratches timber — it is how you catch something faster than
  you, and the only reason to load it.

Broadsides still cannot be swung onto a target dead ahead — that's bow
chasers' job now (Camera & Controls, above).

| Class | Guns/side | Reload | Volley (round) | Hull HP | Rig HP |
| --- | --- | --- | --- | --- | --- |
| Sloop | 4 | 4.5 s | 12 | 90 | 60 |
| Brig | 8 | 5.5 s | 24 | 150 | 95 |
| Frigate | 14 | 7.0 s | 42 | 230 | 140 |
| Galleon | 22 | 9.0 s | 66 | 340 | 200 |

Damage is 3.0 per ball. **Cross-tier fights are deliberately lopsided**: a
Galleon sinks a Sloop in about two connecting volleys, while a Sloop needs
~29 to return the favour. That is the linear-tier model doing what it says on
the tin — the Sloop's answer is to refuse the trade, not to win it — and
whether that is *fun* is precisely the thing that needs playtesting.

#### Bow chasers and drop weapons

Two weapon groups the look-directed scheme adds, in `game/src/sim/combat.ts`.
Numbers below are starting points, same as the broadside table — not tuned
or playtested:

| Group | Guns | Reload | Role |
| --- | --- | --- | --- |
| Bow chasers | 2, fixed forward | Fast — half a broadside's | Chases a fleeing target; always chain, since catching is the point, not sinking |
| Drop weapon | 1 charge | Slow — 1.5x a broadside's | A fire barrel dropped astern, falling almost straight down into the wake; detonates in a ~10 m radius on water contact — punishes a ship following too close, not an aimed shot |

#### Hold-to-aim spread

Tapping fire sends a volley at the standing spread (`BEARING_SPREAD` = 0.045
rad, `RANGE_SPREAD` = 0.035, `game/src/sim/combat.ts`) — forgiving of
bearing error, right for a target that is close and jinking. Holding aim
(RMB) narrows both toward a third of that over about a second — a
placeholder curve, not a tuned one — trading time spent broadside-on for a
tighter pattern at range. This is the current answer to the open question
below about whether fixed broadsides give enough aiming skill: real skill
expression, without giving the guns any traverse.

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
  → Babylon: `scene.fogMode = FOGMODE_LINEAR` with `fogStart`/`fogEnd` set
  to the weather's range. (Linear, not EXP — the prototype fades with
  `smoothstep(start, end)`, which linear matches directly.)
- **Flat facets, no gradients.** One flat fill per triangle; shape reads
  from the angle between neighboring facets.
  → Babylon: flat/faceted normals (`mesh.convertToFlatShadedMesh()`).
- **Faceted water, damped by distance.** Waves are displaced geometry,
  choppy near camera and flattening toward the horizon.
- **Chunky silhouettes.** A ship is a hull, a mast, and two or three
  sails. If it isn't recognizable at minimap size, it has too many parts.
- **Ships sit *in* the water, not on it.** In the prototype this needed an
  explicit waterline clip, because painter's-algorithm sorting cannot
  resolve a hull against huge ocean facets. In Babylon the depth buffer
  handles it and no clip is used — see `game/src/render/shipMesh.ts`.

Palette (per scene, five hues plus a reserved accent): sea `#2F97B8`,
crest `#7ED6DD`, haze `#D8E8F2`, hull `#A5662F`, deck `#D3A05A`, sail
`#F4ECD8`, accent `#E2A84F`. Ship identity comes from hull/sail tone —
distinct enough to tell friend from foe at range.

`prototype/` holds the small flat-shading renderer used for the mockups.
It is not the game engine — it exists so the art direction is executable
and reviewable, and so the values above are grounded in something real.

## Ship Classes

Four classes on a single axis — speed and turn traded for hull and
broadside weight. **Linear tiers, not rock-paper-scissors**: a heavier ship
wins any trade it can force, and a lighter ship's job is to refuse that
trade by controlling range and angle. Skill decides fights rather than
matchups, and every class is legible to a new player from its silhouette.

| Class | Role | Rig | Length | L:B | Guns | Crew | Speed | Turn | Hull | Broadside |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sloop | Skirmisher | Fore-and-aft | 16 m | 3.9 | 8 | 12 | 5 | 5 | 2 | 2 |
| Brig | All-rounder | Square, 2 masts | 21 m | 3.5 | 16 | 24 | 4 | 4 | 3 | 3 |
| Frigate | Line fighter | Square, 3 masts | 27 m | 3.7 | 28 | 42 | 3 | 3 | 4 | 4 |
| Galleon | Fortress | Square + lateen | 34 m | 3.1 | 44 | 68 | 2 | 1 | 5 | 5 |

Ratings are 1–5 relative placeholders stating intent, not tuned values.

**Classes are told apart by rig, not by scale.** Scaling one hull four
times produces four ships that read identically at any distance — the
first pass did exactly that and it did not work. Each class now has its
own rig and its own hull proportions:

- **Sloop** — the only fore-and-aft rig: one tall mainsail and a jib, no
  square canvas. Finest hull in the roster (L:B 3.9) and the lowest
  freeboard.
- **Brig** — two square-rigged masts with a spanker aft.
- **Frigate** — three masts carrying topgallants; the tallest rig afloat.
- **Galleon** — four masts ending in a lateen mizzen, two full gun decks,
  a beakhead forward and a four-deck stern castle. Beamiest hull (L:B
  3.1) and by far the tallest sides.

Gun ports are the secondary cue and follow the hull surface in both axes,
so port count reads as firepower at a glance. All four are verified
distinguishable in flat black at roughly minimap size — see the
silhouette test in the Ship Classes mockup.

Definitions live in `prototype/shipclasses.js` — geometry and stats in one
table, so the renders can't drift from the numbers printed beside them.

## Sailing Model

Speed is `base x pointOfSail(angle off wind) x windStrength x sailTrim`.
Turn rate falls off as a ship approaches its top speed, so nothing pivots at
full pace, and speed chases its target rather than snapping to it — that lag
is most of what makes a heavy ship feel heavy.

| Angle off wind | Zone | Multiplier |
| --- | --- | --- |
| 0-40 deg | In irons | 0.12 |
| 40-70 deg | Close hauled | 0.30 - 0.65 |
| 70-120 deg | Beam reach | 0.92 - 1.00 |
| 120-160 deg | Broad reach | 0.95 - 0.82 |
| 160-180 deg | Running | 0.75 |

| Class | Base speed | Turn rate | Accel |
| --- | --- | --- | --- |
| Sloop | 9.0 m/s | 45 deg/s | 2.6 |
| Brig | 8.0 m/s | 34 deg/s | 2.0 |
| Frigate | 7.0 m/s | 25 deg/s | 1.5 |
| Galleon | 5.5 m/s | 16 deg/s | 1.0 |

Wind strength by weather: clear 0.55, fair 1.0, squall 1.35, storm 1.6,
fog 0.5 — which is why the same ship reads about 4.6 kn in clear air and
13.3 kn in a gale. The zone table above is interpolated rather than stepped;
flat zones feel like a gearbox when you steer across a boundary.

All values are starting points for tuning, not balance claims.

## Implementation

The playable build lives in `game/` (Babylon.js + Vite + TypeScript). It is
**structured for authoritative multiplayer from day one** on one rule: the
simulation never imports the engine, and the renderer never mutates
simulation state. Commands and snapshots cross a `Transport` interface which
today runs in-process and later becomes a WebSocket, with a configurable
simulated latency so the client's interpolation buffer is exercised now
rather than on the day real networking lands.

Client-side prediction is deliberately deferred — the slice renders
authoritative state with interpolation only, which is the honest baseline
prediction will be measured against. See `game/README.md`.

## Weather

Five sea states. Weather is meant to change what you can *do*, not just what
you can see — wave height drives gunnery accuracy, wind strength drives
speed, and visibility decides how late you spot anyone.

| Condition | Sea | Wave | Wind | Visibility | Effect |
| --- | --- | --- | --- | --- | --- |
| Clear | Glassy | 0.3 | Light | 100% | Best gunnery, worst sailing |
| Fair | Moderate | 1.1 | Steady | 90% | The baseline |
| Squall | Choppy | 2.0 | Strong, gusting | 55% | Faster, much less accurate |
| Storm | Heavy | 3.1 | Gale | 30% | Knife-range fights only |
| Fog | Slight | 0.5 | Light | 15% | Ambush; gunnery fine, finding targets is not |

Wave figures are the renderer's relative amplitude, not metres.

**Fog is deliberately the odd one out.** Every other state moves along the
same rough-to-calm axis; fog pairs flat water with almost no sight line, so
it rewards ambush and punishes big slow silhouettes. It is the one condition
where a Sloop is favoured against a Galleon, and the one where the minimap
matters more than the screen.

Weather ties into two systems already designed: the HUD's wind indicator
becomes more than flavour once wind strength varies by condition, and the
target readout's range figure only matters once visibility can cut it.

Presets live in `prototype/weather.js` — sky, light rig, fog range, sea
state and rain are all data, so a condition is a table entry rather than
code.

## Progression / Meta (placeholder)

Not yet designed. Candidate ideas to revisit later: cosmetic customization
(sails, flags, hull paint), unlockable ammo types, and whether classes are
unlocked or available from the start. Class-specific abilities are
deliberately out of scope — the linear-tier model above assumes classes
differ only in numbers and silhouette.

## Open Questions

- [x] ~~Whether to structure for multiplayer up front~~ — resolved: yes.
      Authoritative simulation at 30 Hz behind a `Transport` seam, snapshot
      interpolation on the client. See `game/README.md`.
- [ ] Networking transport and hosting (WebSocket vs WebRTC, server
      topology, matchmaking). The seam exists; the wire does not.
- [ ] Client-side prediction and reconciliation — deferred, not designed.
- [ ] Whether 60 fps holds on real GPU hardware. The slice runs on a
      software rasteriser in CI (~9-13 fps, a floor) with a light budget of
      ~86k vertices and 3-4 draw calls, but this has not been measured on an
      actual GPU.
- [x] ~~Ship roster size and differentiation at launch~~ — resolved: four
      classes on linear tiers (see Ship Classes above).
- [ ] Whether the Sloop's turn advantage is actually enough to survive a
      Galleon broadside at close range. Now playable — the numbers say no,
      by design; the question is whether that reads as fair or as pointless.
- [ ] Whether fixed broadsides plus a range-only reticle give enough aiming
      skill, or whether the guns need some traverse. Partially addressed by
      the hold-to-aim spread mechanic (see Gunnery) — real skill expression
      without giving the guns traverse — now playable in `game/`, but not yet
      playtested by a human against another human, so the question stands
      until it is.
- [x] ~~Whether one mouse can carry both free-look and hold-to-aim without a
      second stick or button doing double duty~~ — resolved for mouse/
      keyboard: pointer-locked look, LMB fire, RMB hold-to-aim
      (`game/src/input/mouse.ts`). Still untested with a controller.
- [ ] Whether brace is strictly dominant once its telegraph exists — if it
      is free to hold indefinitely with no cost worse than what it already
      imposes, there is no reason not to hold it on cooldown. Unchanged —
      brace is still not built.
- [ ] Whether the 60° bow and stern arcs are wide enough to select reliably
      mid-fight, or whether a fast yaw swing overshoots past them under real
      mouse input. The arcs and hysteresis are real now (`game/src/sim/
      lookSector.ts`), so this is playtestable rather than theoretical — it
      just hasn't been playtested yet.
- [ ] Grape shot and a crew damage track — deferred until crew does something.
- [ ] Whether weather is fixed for a match or shifts during one. Fixed is
      easier to balance and lets players pick a ship against known
      conditions; shifting is more dramatic but makes ship choice a gamble.
      A middle option: fix it at match start, then telegraph one scheduled
      change everyone can see coming.
- [ ] Whether weather is matchmade (players opt into conditions) or rolled
      per match.
- [ ] Target session length for a PvP match.
- [x] ~~Overall art tone~~ — resolved: bright daylight stylized low-poly
      (see Art Direction above).
- [ ] How far ship customization can push the palette before scenes stop
      reading as one game.
- [ ] Monetization / progression systems — in scope for the mockup phase
      at all, or purely post-MVP?
- [ ] Minimum player count per match, and how bots fill gaps (matchmaking
      timeout, always-on bots, etc.).
