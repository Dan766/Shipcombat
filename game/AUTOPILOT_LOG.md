# Autopilot log

## 2026-10-30 (UTC, run 23) — non-finite aimRange/aimHold no longer create NaN shots
- Baseline: merge no-op; verify (typecheck, layering, determinism, combat) green, build green. verify:render NOT run: small sim-only change, no render path touched; run 14 numbers stand.
- Change: `src/sim/world.ts` substitutes MIN_RANGE for a non-finite `aimRange` and 0 for a non-finite `aimHold` before `fireVolley` (NaN passed through Math.min/max and spawned NaN projectiles). Test: "non-finite aimRange/aimHold still fire finite projectiles" in "world command handling"; fails without the fix, passes with it.
- Verification: verify and build green after.
- Skipped: brace / crew / grape shot still undesigned.
- Ideas: validate `fire`/`ammo` values at the net boundary; sweep duels for time-to-decide; storm frigate duel still ~577 s.

## 2026-10-30 (UTC, run 22) — non-finite commands no longer poison a ship
- Baseline: merge no-op; verify (typecheck, layering, determinism, combat) green, build green. verify:render NOT run: small sim-only change, no render path touched; run 14 numbers stand.
- Change: `src/sim/world.ts` treats a non-finite `turn` as 0 and ignores a non-finite `sail`. Math.min/max pass NaN through, so one malformed command (e.g. over the network) made heading/x/z NaN permanently. Test: "non-finite turn/sail keep heading, position and speed finite" in the "world command handling" block; fails without the fix (heading NaN), passes with it.
- Verification: verify and build green after.
- Skipped: brace / crew / grape shot still undesigned.
- Ideas: validate other Command fields (aimRange, aimHold) for NaN at the net boundary; sweep duels for time-to-decide; storm frigate duel still ~577 s.

## 2026-10-30 (UTC, run 21) — timeOfFlight test coverage
- Baseline: merge no-op; verify (typecheck, layering, determinism, combat) green, build green. verify:render NOT run: tests-only change, no src/ change; run 14 numbers stand.
- Change: tests only (`scripts/combat-tests.ts`, new "timeOfFlight and elevation edges" block): timeOfFlight agrees with the integrated flight time (within 2 ticks; 60 m 0.925 vs 0.900 s, 250 m 4.038 vs 4.033 s), sub-minimum range raised to MIN_RANGE, elevation monotone and under 45 deg, flight time capped at MAX_RANGE. No src change.
- Finding: timeOfFlight is the ideal-ballistics value and runs about 0.025 s long at short range versus the fixed-step integrator; harmless.
- Verification: verify and build green after.
- Skipped: brace / crew / grape shot still undesigned.
- Ideas: sweep duels for time-to-decide; storm frigate duel still ~577 s; test heel/oceanAmp consumers.

## 2026-10-29 (UTC, run 20) — sinking ships stay inside the arena
- Baseline: merge no-op; verify (typecheck, layering, determinism, combat) green, build green. verify:render NOT run: one-line sim change, no render path touched; run 14 numbers stand.
- Change: `src/sim/world.ts` clamps a sinking ship's drift to ARENA_HALF (previously only live ships were clamped, so a wreck at the wall drifted outside). Test: "a sinking ship stays inside the arena" in the "world rules" block; fails without the fix (overshoot 2.48 m), passes with it.
- Verification: verify and build green after.
- Skipped: brace / crew / grape shot still undesigned.
- Ideas: sweep duels for time-to-decide; storm frigate duel still ~577 s; test heel/oceanAmp consumers.

## 2026-10-29 (UTC, run 19) — world command handling test coverage
- Baseline: merge no-op; verify (typecheck, layering, determinism, combat) green, build green. verify:render NOT run: tests-only change, no src/ change; run 14 numbers stand.
- Change: tests only (`scripts/combat-tests.ts`, new "world command handling" block): ready mount fires and empties, reloading mount refuses to fire, other broadside unaffected, port reload takes reloadSec (4.53 s vs 4.5), ackSeq follows the player and never moves backwards, sail/turn clamping, setWeather shows in snapshot. No src change.
- Verification: verify and build green after.
- Skipped: brace / crew / grape shot still undesigned.
- Ideas: sinking ships are not clamped to the arena wall (they drift on); sweep duels for time-to-decide; storm frigate duel still ~577 s.

## 2026-10-29 (UTC, run 18) — look-sector bearing wrap
- Baseline: merge no-op; verify (typecheck, layering, determinism, combat) green, build green (first `npm ci` failed transiently, second passed). verify:render NOT run: one-line sim change, no render path touched; run 14 numbers stand.
- Change: `src/sim/lookSector.ts` `inLookArc` now folds any bearing into [0,360) first, closing the run 17 finding (bearings like -450 deg matched no sector). main.ts already normalizes yaw, so no live bug; this is hardening. Test: "bearings beyond one revolution fold onto the same sector" in `scripts/combat-tests.ts`.
- Verification: verify and build green after.
- Skipped: brace / crew / grape shot still undesigned.
- Ideas: sweep duels for time-to-decide; storm frigate duel still ~577 s; test heel/oceanAmp consumers (renderer-only, `heel` has no sim consumer).

## 2026-10-29 (UTC, run 17) — look-sector hysteresis test coverage
- Baseline: merge no-op; verify (typecheck, layering, determinism, combat) green, build green. verify:render NOT run: tests-only change, no src/ change; run 14 numbers stand.
- Change: tests only (`scripts/combat-tests.ts`, "look sectors" block): hysteresis band edges (bow holds to +4 deg past the seam and releases at 4.5; starboard likewise from below), a bearing and the same +360 deg agree, stern covers +-180, port -90 / starboard +90, bow holds across the 0/360 seam. No src change.
- Finding: `inLookArc` only folds one revolution (offsets -360/0/+360), so a bearing like -450 deg is not covered by any sector (falls back to last/'bow'). Not a bug while camera yaw stays within about +-360; noted in case yaw ever accumulates unwrapped.
- Verification: verify and build green after.
- Skipped: brace / crew / grape shot still undesigned.
- Ideas: sweep duels for time-to-decide; storm frigate duel still ~577 s; test heel/oceanAmp consumers; check camera yaw is wrapped before it reaches armedMountFor.

## 2026-10-29 (UTC, run 16) — fireDropWeapon test coverage
- Baseline: merge no-op; verify (layering, determinism, combat) green, build green. verify:render NOT run: tests-only change, no src/ change; run 14 numbers stand.
- Change: tests only (`scripts/combat-tests.ts`, new "fireDropWeapon" block): id/owner/ammo, zero vertical speed, 0.6x ship motion, spawn point astern at 0.55 hull lengths, same-tick determinism. No src change.
- Verification: verify and build green after.
- Skipped: brace / crew / grape shot still undesigned.
- Ideas: sweep duels for time-to-decide; storm frigate duel still ~577 s; test heel/oceanAmp consumers.

## 2026-10-28 (UTC, run 15) — applyHit / fireVolley test coverage
- Baseline: merge no-op; verify (layering, determinism, combat) green, build green. verify:render NOT run: tests-only change, no src/ change; run 14 numbers stand.
- Change: tests only (`scripts/combat-tests.ts`, new "applyHit and fireVolley" block): hull/rig damage formulas per ammo, lethal hit reports sunk and clamps at 0, gun counts per mount, side directions, bow chasers always chain, unique ids and shooter id, same-tick determinism, aimHold narrows spread. No src change.
- Verification: verify and build green after.
- Skipped: brace / crew / grape shot still undesigned.
- Ideas: sweep duels for time-to-decide; storm frigate duel still ~577 s; test fireDropWeapon output (no vertical speed, carries ship motion).

## 2026-10-28 (UTC, run 14) — projectile stepping test coverage
- Baseline: merge no-op; verify (layering, determinism, combat) green, build green, verify:render green (Chromium /opt/pw-browsers/chromium-1243; combat: foe hull 1.00 -> 0.49, rig 1.00 -> 0.87; worst 8.6 fps, slow host). Per-weather frame times and vert count cut off from my output (tail only), not recorded.
- Change: tests only (`scripts/combat-tests.ts`, new "stepProjectile" block): `stepProjectile` was untested. Asserts a shot aimed at 120 m lands within one tick of travel (118.0 m), age counts steps, farther aim lands farther, aim range clamps to MIN_RANGE/MAX_RANGE, gravity pulls a stationary shot at g. No src change.
- Verification: verify and build green after. Render not rerun: no src/ change.
- Skipped: brace / crew / grape shot still undesigned.
- Ideas: test `applyHit` and `fireVolley` directly; sweep duels for time-to-decide; storm frigate duel still ~577 s.

## 2026-10-28 (UTC, run 13) — weather wind-strength test coverage
- Baseline: merge no-op; verify (layering, determinism, combat) green, build green. verify:render NOT run: tests-only change, no src/ change; run 12 numbers stand.
- Change: tests only (`scripts/combat-tests.ts`, new "weather wind strength" block): WEATHER_ORDER covers every preset once, ids match keys, wind strengths positive, and a brig running before the wind has a higher peak speed in stronger weather (fog 3.00, clear 3.30, fair 6.00, squall 8.10, storm 9.60 m/s). No src change.
- Finding: measure peak, not final speed: a fast ship hits the arena wall within 40 s and the clamp halves speed each tick (final squall/storm speed read 0.07). Expected clamp behaviour, not a bug.
- Verification: verify green after.
- Ideas: sweep duels for time-to-decide after the flee-vs-wind change; storm frigate duel still ~577 s; test heel/oceanAmp consumers; brace / crew / grape shot still undesigned.

## 2026-10-28 (UTC, run 12) — determinism hash sensitivity test
- Baseline: merge no-op; verify (layering, determinism, combat) green, build green, verify:render green (Chromium at /opt/pw-browsers/chromium-1243/chrome-linux64/chrome; clear 93.8 ms / fair 95.8 / squall 96.5 / storm 95.7 / fog 89.2; 86156 verts; worst 10.4 fps; combat: foe hull 1.00 -> 0.48, rig 1.00 -> 0.87). Frame times ~25% above run 11 with identical geometry; slower host (worst fps 10.4 vs 12.6), not a code change.
- Change: tests only (`scripts/determinism.ts`): `run` takes a wind direction; asserts the world hash differs under a changed wind direction, a negated command log, and one fewer tick, so "identical hash across runs" can't pass vacuously. No src change.
- Verification: verify and build green after. Render not rerun: no src/ change.
- Skipped: the run-11 idea "test wind gust determinism" is moot: wind is a constant `windFrom` with no gust/time variation in `src/sim/wind.ts` or `world.ts`. Brace / crew / grape shot still undesigned.
- Ideas: sweep duels for time-to-decide after the flee-vs-wind change; storm frigate duel still ~577 s; test that setClass/setWeather mid-run keep determinism across more switch orderings.

## 2026-10-28 (UTC, run 11) — fleeing bot avoids irons
- Baseline: merge no-op; verify (layering, determinism, combat) green, build green, verify:render green (Chromium /opt/pw-browsers; clear 73.2 ms / fair 76.3 / squall 72.3 / storm 77.8 / fog 74.1; 86156 verts; worst 12.8 fps; combat: foe hull 1.00 -> 0.63, rig 1.00 -> 0.91).
- Change: `src/sim/bot.ts` — `botCommand` takes an optional `windFrom` (passed by `World`). A fleeing bot whose straight-away heading is within ~50 deg of the wind (irons, ~0.12x speed) now bears off to the nearest heading at 50 deg off the wind instead, so the runner keeps way on. Tests: new "bot flee vs wind" block in `scripts/combat-tests.ts` (beam wind / no wind info unchanged; both bear-off sides; heading is out of irons).
- Verification: verify and build green. Render after: clear 75.0 / fair 70.7 / squall 71.0 / storm 79.3 / fog 68.2 ms, 86156 verts, worst 12.6 fps, foe hull 1.00 -> 0.65 (no regression; sim-only). Existing duel-decided tests still pass.
- Skipped: no duel sweep measuring how much longer or shorter fleeing duels now run; 50 deg threshold is a guess (difficulty knob for the human). Brace / crew / grape shot still undesigned.
- Ideas: sweep 9 duels for time-to-decide after this change; storm frigate duel still ~577 s; test wind-direction/gust determinism over time.

## 2026-10-27 (UTC, run 10) — wave field test coverage
- Baseline: merge no-op; verify (layering, determinism, combat) green, build green. verify:render NOT run this time (tests-only change, no src/ change; numbers from run 9 stand).
- Change: tests only (`scripts/combat-tests.ts`, new "wave field" block): `waveHeight`/`waveNormal` were untested. Asserts height bound (sum of amplitudes), purity, linear scaling with amplitude, flat sea with upright normal at amp 0, unit upward normals, no calming far from origin (near 1.91 vs far 1.92 peak), normal leans downhill. No src change.
- Verification: verify and build green after.
- Skipped: brace / crew / grape shot still undesigned.
- Ideas: flee should consider wind; storm frigate duel still ~577 s; test wind-direction/gust determinism over time.

## 2026-10-27 (UTC, run 9) — points-of-sail test coverage
- Baseline: merge no-op; verify green, build green, verify:render green (Chromium /opt/pw-browsers; worst 11.3 fps; combat: foe hull 1.00 -> 0.48, rig 1.00 -> 0.87; peak 14 projectiles). Per-weather frame times and vert count were cut off from my output (tail only), not recorded.
- Change: tests only (`scripts/combat-tests.ts`, new "points of sail" block): `pointOfSail` was never tested directly. Asserts irons is slowest, beam reach (peak 1.00 at 100 deg) fastest, curve continuous (max step 0.023/deg), running slower than broad reach, clamping/sign, `pointOfSailName` zones, `angleOffWind` wrap, `normalizeAngle` range. No src change.
- Verification: verify (layering, determinism, combat) and build green. Render not rerun: no src/ change.
- Skipped: brace / crew / grape shot still undesigned.
- Ideas: flee should consider wind; storm frigate duel still ~577 s; test wave height/normal bounds and determinism of waves.

## 2026-10-27 (UTC, run 8) — drop-blast radius edge test
- Baseline: merge no-op; verify green, build green, verify:render green (Chromium /opt/pw-browsers; clear 80.6 ms / fair 78.2 / squall 82.8 / storm 74.1 / fog 68.3; 86156 verts; worst 12.1 fps; combat: foe hull 1.00 -> 0.65, rig 1.00 -> 0.91). No regression vs run 7/6.
- Change: tests only (`scripts/combat-tests.ts`, "drop weapon" block): locates the charge's splash point from a dropBlast event, then parks one ship 1 m inside and one 1 m outside DROP_RADIUS; asserts the inner is hit (hull 0.900) and the outer untouched (1.000). Also imports DROP_RADIUS. No src change.
- Verification: verify (layering, determinism, combat) and build green. Render check not rerun: no src/ change.
- Skipped: brace / crew / grape shot still undesigned.
- Ideas: flee should consider wind; storm frigate duel still ~577 s; bot could open range instead of staying in a stern-follower's charge radius.

## 2026-10-27 (UTC, run 7) — drop-blast test coverage
- Baseline: merge no-op; verify green, build green, verify:render green (Chromium /opt/pw-browsers; 86156 verts as before; combat: foe hull 1.00 -> 0.66, rig 1.00 -> 0.92; worst 13.6 fps). Per-weather frame times were cut off from my output (tail only), not recorded.
- Change: tests only (`scripts/combat-tests.ts`, "drop weapon" block): the dropper is not hurt by its own blast, a splash-point blast emits `dropBlast`, every ship inside DROP_RADIUS is hit, a blast can sink a crippled follower (exactly one `sunk` event). Finding: a follower right on the dropper's stern is hit directly by the charge (impact, not blast), so the old "close astern" test exercised a direct hit; the new tests park ships abeam of the splash point to exercise the radius path. No src change.
- Verification: verify (layering, determinism, combat) and build green. Render check not rerun: no src/ change.
- Skipped: brace / crew / grape shot still undesigned.
- Ideas: flee should consider wind; storm frigate duel still ~577 s; test that blast damage stops at DROP_RADIUS exactly (edge ship at 10 m vs 11 m).

## 2026-10-27 (UTC, run 6) — world-rule test coverage
- Baseline: merge no-op; verify green, build green, verify:render green (Chromium /opt/pw-browsers/chromium-1243; clear 81.1 ms / fair 83.4 / squall 86.8 / storm 75.8 / fog 73.2; 86156 verts; worst 11.5 fps; combat: foe hull 1.00 -> 0.63, rig 1.00 -> 0.91). No regression vs run 5.
- Change: tests only (`scripts/combat-tests.ts`, new "world rules" block): arena clamp holds a ship at the wall, `setClass` resets hull/rig/reload, a sunk ship respawns at its fixed spawn point at rest, a sinking hull is not hittable. These behaviours were previously untested. No sim/src change, so behaviour is unchanged by construction.
- Verification: verify (incl. layering, determinism) and build green after. Render check not rerun: no file under src/ changed, so the numbers above stand.
- Skipped: brace / crew / grape shot are still undesigned in GAME_DESIGN.md; not attempted.
- Ideas: flee should consider wind; storm frigate duel still ~577 s (roll aim compensation); test drop-blast radius sinking a ship and that the blast ignores its owner.

## 2026-10-26 (UTC, run 5) — verify-render combat now asserts a hit
- Baseline: merge no-op; verify green, build green, verify:render green (Chromium /opt/pw-browsers/chromium-1243; clear 82.1 ms / fair 77.3 / squall 77.8 / storm 85.9 / fog 76.5; 86156 verts; worst 11.6 fps). Combat section again landed no damage (the foe was never in arc).
- Change: `src/main.ts` adds a `__ship.placeFoe(side, range)` debug hook (parks the foe dead abeam, stopped, bot off); `scripts/verify-render.mjs` uses it, fires starboard broadsides, and now FAILS if no damage lands. Client/debug only, no sim change, so no sim test added.
- Verification: verify:render after: storm 84.9 / fog 79.0 ms, same 86156 verts, worst 11.8 fps (no regression); combat: foe hull 1.00 -> 0.63, rig 1.00 -> 0.91. verify, build, layering, determinism green.
- Skipped: nothing else attempted.
- Ideas: flee should consider wind; storm frigate duel still takes ~577 s (aim compensation for roll); crew damage / grape shot still undesigned.

## 2026-10-26 (UTC, run 4) — no game change
- Baseline: merge no-op; verify green, build green, verify:render green (Chromium /opt/pw-browsers; clear 118.2 ms / fair 107.4 / squall 107.8 / storm 131.1 / fog 99.7; 86156 verts; worst 7.6 fps). Frame times are ~40% above run 3 (76 ms) with identical geometry and no code change in this run, so this is host/SwiftShader load, not a regression. Combat section again landed no damage.
- Change: none. I looked at making verify-render combat assert hits (the idea carried over from runs 1-3), but `window.__ship` in `src/main.ts` has no way to place the foe in the firing arc. Doing it means adding a debug hook to the client, and I couldn't verify a render-script change reliably on a host rendering at ~8 fps. I chose not to land an unverified change.
- Skipped: everything else; no design-doc feature (brace, grape shot) attempted, as they are still undesigned/deferred in GAME_DESIGN.md.
- Ideas: add a `__ship.placeFoe(bearing, range)` debug hook and assert damage in verify-render; flee should consider wind; storm frigate duel still takes ~577 s to decide.

## 2026-10-26 (UTC, run 3) — chaser holds the beam on a quarry
- Baseline: merge no-op; verify green, build green, verify:render green (Chromium /opt/pw-browsers; clear 76.2 ms / fair 76.8 / squall 77.5 / storm 76.7 / fog 79.3; 86156 verts). Combat section again landed no damage.
- Finding: the residual duel stalls were an oscillation at ~90 m: the chaser stopped chasing at 0.7x preferred range, then "too close" logic opened range, so it never held a broadside on the wreck (stalls at d=90 in 4 of 9 setups).
- Change: `src/sim/bot.ts` — when the target is a quarry (hull < FLEE_HULL and below own) and within chase range, the bot holds the beam without the range-opening offset. 9-duel sweep (3 weathers x brig/frigate/sloop-galleon, 600 s cap): 9 of 9 decided (was 7), longest 577 s. Tests: new beam-hold check and a fair-weather frigate duel decided within 300 s (139 s) in the "bot pursuit" block.
- Verification: verify + build green. Render after: clear 76.0 ms (first row seen; run's remainder cut off by my shell being killed, geometry unchanged, sim-only change).
- Skipped: storm frigate duel still takes 577 s; no tuning of the 0.7x threshold. Render-check combat still lands no damage.
- Ideas: make verify-render combat assert hits; flee should consider wind; speed up finishing in storm (aim compensation for roll).

## 2026-10-26 (UTC, run 2) — bots run down a crippled runner
- Baseline: merge no-op; verify green, build green, verify:render green (Chromium /opt/pw-browsers; clear 97.1 ms / fair 89.7 / squall 86.0 / storm 87.0 / fog 76.5; 86156 verts). Combat section again landed no damage.
- Finding: bot-vs-bot duels (9 setups: 3 weathers x brig/frigate/sloop-galleon pairs, 600 s cap) stalled in 5 of 9 — the loser fled at <30% hull and the winner kept circling at preferred range, so the runner survived at 0.12-0.27 hull for the full 10 minutes.
- Change: `src/sim/bot.ts` — a bot whose target is below `FLEE_HULL` and below its own hull now steers straight at it (`chasing`) while range > 0.7x preferred. Same duels after: 7 of 9 decided; the other 2 end with the loser dismasted (rig ~0) at hull 0.01-0.11, not yet sunk. Tests: new "bot pursuit" block (chases a crippled runner, still takes the beam vs a healthy one, brig duel is decided within 600 s); the "hurt bot that is winning" check now asserts it turns in rather than that it holds the beam.
- Verification: verify + build green. Render after: clear 87.0 ms / fair 81.9 / squall 78.2 / storm 83.4 / fog 78.8, verts unchanged (no regression; sim-only).
- Skipped: the 2 residual stalls (dismasted wrecks that never finish sinking) not investigated; chase threshold reuses FLEE_HULL, a difficulty knob for the human. Render-check combat still lands no damage.
- Ideas: investigate wrecks at ~0 rig / low hull that don't sink and the chaser not finishing them; make verify-render combat assert hits; flee should consider wind.

## 2026-10-26 (UTC) — losing bot breaks off
- Baseline: merge with base was a no-op; verify green, build green, verify:render green (Chromium /opt/pw-browsers; clear 100.1 ms / fair 91.9 / squall 87.8 / storm 94.6 / fog 86.5; 86156 verts, 5-6 meshes). Combat section again landed no damage.
- Change: `src/sim/bot.ts` — when own hull < `FLEE_HULL` (0.3) and below the target's hull, the bot steers directly away instead of circling (the unused `circleDir` comment already anticipated disengaging); it still fires any broadside that bears. New "bot disengage" tests in `scripts/combat-tests.ts` (healthy holds the beam, hurt+losing turns away and still fires, hurt but winning keeps fighting).
- Verification: verify + build green. Render after: clear 96.6 ms / fair 96.6 / squall 93.0 / storm 93.8 / fog 89.7, verts unchanged. Frame time is ~20% above the last logged entry (80 ms), but the same-day pre-change baseline was already that high and the change is sim-only, so I attribute it to host/SwiftShader noise.
- Skipped: no duel simulation measuring how often fleeing happens or whether bots now become unkillable runners; 0.3 threshold is a guess and a difficulty knob for the human. Render-check combat still lands no damage.
- Ideas: make verify-render combat assert hits; bot flee should consider wind (run downwind / can't outrun in irons); bot repairs/brace once brace exists.

## 2026-10-25 (UTC, run 3) — bot holds aim like a player
- Baseline: verify green, build green, verify:render green (Chromium at /opt/pw-browsers/chromium-1243/chrome-linux64/chrome; clear 78.5 ms / fair 79.3 / squall 76.8 / storm 84.1 / fog 71.8; 86156 verts, 5-6 meshes). Combat section again landed no damage.
- Change: `src/sim/bot.ts` now sends `aimHold`. It ramps over ~1 s (30 ticks) while a broadside arc and range bear, carries through the reload, resets when the bot fires or the target leaves the arc. Before, the bot always fired at full spread, which the player can shrink to a third. `BotMemory` gains `aimHold`. New "bot aim hold" tests in `scripts/combat-tests.ts` (builds mid-reload, full at shot, spent by firing, lost off-arc).
- Verification: verify + build green. Render after: clear 80.6 ms / fair 80.7 / squall 84.9 / storm 84.9 / fog 81.1, verts unchanged (all within 10% of run 2; sim-only change). Stationary-target bot test: 26 hits/90 s, hull 0.75, rig 0.39 (was 27 / 0.74 / 0.36), so that scenario shows no measurable accuracy gain. The benefit is largely in moving duels and was not measured.
- Skipped: no A/B duel measurement of the accuracy gain. Bots are now somewhat more dangerous in play; the human may want to tune the ramp (`AIM_RAMP_TICKS`) as a difficulty knob. Render-check combat still lands no damage.
- Ideas: make verify-render combat assert hits (e.g. park the foe in the arc); bot brace/disengage at low hull; bot opens range when a follower sits astern outside charge range.

## 2026-10-25 (UTC, run 2) — bot drops stern charge on close followers
- Baseline: verify green, build green, verify:render green (Chromium at /opt/pw-browsers/chromium-1243; SwiftShader; clear 81.2 ms / fair 78.6 / squall 79.2 / storm 82.3 / fog 72.7; 86156 verts, 5-6 meshes). Combat section again landed no damage.
- Change: `src/sim/bot.ts` fires the stern drop weapon when the target is within ~30 deg of dead astern and under 18 m, the charge is loaded, and no broadside bears. New "bot stern drop weapon" tests in `scripts/combat-tests.ts` (fires, holds while reloading, ignores distant and beam targets).
- Verification: verify (typecheck, layering, determinism, combat) + build green. Render after change: clear 85.4 ms / fair 80.8 / squall 76.6 / storm 88.0, verts unchanged. Frame time is 13-19% above the previous entry, but the same-day pre-change baseline was already +13% and the change is sim-only with identical geometry, so I attribute it to SwiftShader/host noise, not a regression.
- Skipped: README "not done" list not edited; render-check combat still shows no damage.
- Ideas: make verify-render combat assert hits; bot brace/disengage when hull is low; bot turns away to open range when a follower sits astern outside charge range.

## 2026-10-25 (UTC) — bot uses bow chasers
- Baseline: verify green, build green, verify:render green (SwiftShader; clear 71.6 ms / fair 73.6 / squall 67.7 / storm 70.2 / fog 65.8; worst 13.6 fps; 86156 verts, 5-6 meshes).
- Change: `src/sim/bot.ts` fires the bow chasers when the target is within ~10 deg of dead ahead, in range and the bow guns are loaded, and no broadside bears (broadside preferred). New "bot bow chasers" tests in `scripts/combat-tests.ts` (fires dead ahead, holds while reloading, ignores off-axis, prefers broadside).
- Verification: verify + build green; render rerun: clear 71.4 ms / fair 69.8 / squall 68.2, verts 86156 (no regression; the run was cut off by a tool timeout after the squall row, so storm/fog were not rerun). Bot stationary-target test: 27 hits/90 s, hull 0.74, rig 0.36.
- Skipped: README still lists "AI using bow chasers" under not-done; left for the human to edit.
- Ideas: bot uses the stern drop weapon when a follower is close astern; bot brace/disengage when hull is low; render-check combat section showed no damage landed (bot never fires in that scenario) — make it assert hits.

