/* Keyboard -> Command.
 *
 * Input never touches world state. It produces one Command per tick, which
 * goes over the transport like any other client would send it. That is the
 * discipline that keeps a server swap-in honest.
 */

import { MAX_RANGE, MIN_RANGE } from '../sim/ballistics.ts';
import type { AmmoId } from '../sim/types.ts';

/** Steering, sail trim, ammo and range — everything but look/fire/aim, which
 *  live in mouse.ts now that the camera is free-look. */
export interface SteeringIntent {
  turn: number;
  sail: number;
  aimRange: number;
  ammo: AmmoId;
  boost: boolean;
}

export class KeyboardInput {
  private held = new Set<string>();
  private sail = 1;
  private aim = 120;
  private ammo: AmmoId = 'round';

  /** Debug hotkeys, handled outside the command stream. */
  onHotkey: ((key: string) => void) | null = null;

  attach(target: Window): void {
    target.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      const repeat = this.held.has(k);
      this.held.add(k);

      if (!repeat && k === 'r') this.ammo = this.ammo === 'round' ? 'chain' : 'round';
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
  sample(dt: number): SteeringIntent {
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

    return {
      turn: (right ? 1 : 0) - (left ? 1 : 0),
      sail: this.sail,
      aimRange: this.aim,
      ammo: this.ammo,
      boost: this.held.has('shift'),
    };
  }

  get sailTrim(): number { return this.sail; }
  get aimRange(): number { return this.aim; }
  get ammoType(): AmmoId { return this.ammo; }
}
