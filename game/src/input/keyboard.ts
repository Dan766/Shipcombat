/* Keyboard -> Command.
 *
 * Input never touches world state. It produces one Command per tick, which
 * goes over the transport like any other client would send it. That is the
 * discipline that keeps a server swap-in honest.
 */

import { MAX_RANGE, MIN_RANGE } from '../sim/ballistics.ts';
import type { AmmoId, Command } from '../sim/types.ts';

export class KeyboardInput {
  private held = new Set<string>();
  private seq = 0;
  private sail = 1;
  private aim = 120;
  private ammo: AmmoId = 'round';

  /** Set for exactly one tick when a fire key is pressed. */
  private firePending: -1 | 0 | 1 = 0;

  /** Debug hotkeys, handled outside the command stream. */
  onHotkey: ((key: string) => void) | null = null;
  /** Fired the instant a fire key goes down, for immediate local feedback. */
  onFirePressed: ((side: -1 | 1) => void) | null = null;

  attach(target: Window): void {
    target.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      const repeat = this.held.has(k);
      this.held.add(k);

      if (!repeat) {
        // Firing is edge-triggered: holding the key should not queue volleys.
        if (k === 'q') { this.firePending = -1; this.onFirePressed?.(-1); }
        if (k === 'e') { this.firePending = 1; this.onFirePressed?.(1); }
        if (k === 'r') this.ammo = this.ammo === 'round' ? 'chain' : 'round';
      }

      if ('12345cv'.includes(k)) this.onHotkey?.(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.held.delete(e.key.toLowerCase()));
    target.addEventListener('blur', () => this.held.clear());
    target.addEventListener('wheel', (e) => {
      this.aim = Math.max(MIN_RANGE, Math.min(MAX_RANGE, this.aim - Math.sign(e.deltaY) * 10));
    }, { passive: true });
  }

  /** Sample current intent. Called once per simulation tick, not per frame. */
  sample(dt: number): Command {
    const left = this.held.has('a') || this.held.has('arrowleft');
    const right = this.held.has('d') || this.held.has('arrowright');
    const more = this.held.has('w') || this.held.has('arrowup');
    const less = this.held.has('s') || this.held.has('arrowdown');
    const nearer = this.held.has('[');
    const further = this.held.has(']');

    if (more) this.sail = Math.min(1, this.sail + dt * 0.8);
    if (less) this.sail = Math.max(0, this.sail - dt * 0.8);
    if (nearer) this.aim = Math.max(MIN_RANGE, this.aim - dt * 90);
    if (further) this.aim = Math.min(MAX_RANGE, this.aim + dt * 90);

    const fire = this.firePending;
    this.firePending = 0;

    return {
      seq: this.seq++,
      turn: (right ? 1 : 0) - (left ? 1 : 0),
      sail: this.sail,
      fire,
      aimRange: this.aim,
      ammo: this.ammo,
    };
  }

  get sailTrim(): number { return this.sail; }
  get aimRange(): number { return this.aim; }
  get ammoType(): AmmoId { return this.ammo; }
}
