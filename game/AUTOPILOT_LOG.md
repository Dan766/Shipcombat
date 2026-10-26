# Autopilot log

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

