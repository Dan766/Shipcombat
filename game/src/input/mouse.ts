/* Mouse -> free-look camera, fire, and hold-to-aim.
 *
 * Pointer-locked: click the canvas to lock, mouse movement yaws/pitches the
 * camera continuously (world-space, unconstrained yaw), LMB fires whatever
 * weapon the look direction currently arms, RMB held narrows the volley
 * spread. Input never touches world state — see keyboard.ts for the same
 * discipline applied to steering.
 */

const YAW_SENS = 0.12; // degrees per pixel of mouse movement
const PITCH_SENS = 0.1;
// Pitch is the orbit camera's elevation: higher pitch raises the camera and
// so tilts the view *down* toward the water.
const PITCH_MIN = -15; // camera low, looking up toward the rigging
const PITCH_MAX = 45;  // camera high, looking down at the deck and water
/** Seconds of holding aim to go from standing spread to fully narrowed. */
const AIM_RAMP_SEC = 1.0;
/** Releasing aim snaps back faster than holding it builds — the moment of
 *  firing is the thing that should feel deliberate, not the release. */
const AIM_DECAY_PER_SEC = 4;

export class MouseLook {
  /** World-space camera yaw, degrees. Free — not wrapped to +-180. */
  private yawDeg = 0;
  private pitchDeg = 12;
  private locked = false;
  private rmbHeld = false;
  private aimHoldT = 0;
  private firePending = false;

  /** Fired the instant LMB goes down, for immediate local feedback — the
   *  authoritative volley is still a tick (plus simulated latency) away. */
  onFirePressed: (() => void) | null = null;

  attach(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) {
        // A rejected request (denied, or the embedding document disallows
        // pointer lock entirely) should not surface as an unhandled promise
        // rejection — falling back to "not locked" is already the right
        // behavior, handled by every `if (!this.locked) return` guard below.
        canvas.requestPointerLock()?.catch(() => {});
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.rmbHeld = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yawDeg += e.movementX * YAW_SENS;
      this.pitchDeg = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitchDeg + e.movementY * PITCH_SENS));
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.firePending = true; this.onFirePressed?.(); }
      if (e.button === 2) this.rmbHeld = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.rmbHeld = false;
    });
    // Losing focus (alt-tab, etc.) must drop held state — there is no keyup
    // to tell us RMB was released while the tab was away.
    window.addEventListener('blur', () => { this.rmbHeld = false; });
  }

  /** Sample current intent. Called once per simulation tick. */
  sample(dt: number): { yawDeg: number; pitchDeg: number; firePending: boolean; aimHold: number } {
    this.aimHoldT = this.rmbHeld
      ? Math.min(1, this.aimHoldT + dt / AIM_RAMP_SEC)
      : Math.max(0, this.aimHoldT - dt * AIM_DECAY_PER_SEC);

    const fire = this.firePending;
    this.firePending = false;

    return { yawDeg: this.yawDeg, pitchDeg: this.pitchDeg, firePending: fire, aimHold: this.aimHoldT };
  }

  get yaw(): number { return this.yawDeg; }
  get pitch(): number { return this.pitchDeg; }
  get aimHold(): number { return this.aimHoldT; }
  get isLocked(): boolean { return this.locked; }
}
