# Autopilot log

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

