# Autopilot log

## 2026-10-25 (UTC) — bot uses bow chasers
- Baseline: verify green, build green, verify:render green (SwiftShader; clear 71.6 ms / fair 73.6 / squall 67.7 / storm 70.2 / fog 65.8; worst 13.6 fps; 86156 verts, 5-6 meshes).
- Change: `src/sim/bot.ts` fires the bow chasers when the target is within ~10 deg of dead ahead, in range and the bow guns are loaded, and no broadside bears (broadside preferred). New "bot bow chasers" tests in `scripts/combat-tests.ts` (fires dead ahead, holds while reloading, ignores off-axis, prefers broadside).
- Verification: verify + build green; render rerun: clear 71.4 ms / fair 69.8 / squall 68.2, verts 86156 (no regression; the run was cut off by a tool timeout after the squall row, so storm/fog were not rerun). Bot stationary-target test: 27 hits/90 s, hull 0.74, rig 0.36.
- Skipped: README still lists "AI using bow chasers" under not-done; left for the human to edit.
- Ideas: bot uses the stern drop weapon when a follower is close astern; bot brace/disengage when hull is low; render-check combat section showed no damage landed (bot never fires in that scenario) — make it assert hits.

