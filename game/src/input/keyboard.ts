/* Keyboard -> Command.
 *
 * Input never touches world state. It produces one Command per tick, which
 * goes over the transport like any other client would send it. That is the
 * discipline that keeps a server swap-in honest.
 */

import type { Command } from '../sim/types.ts';

export class KeyboardInput {
  private held = new Set<string>();
  private seq = 0;
  private sail = 1;

  /** Debug hotkeys, handled outside the command stream. */
  onHotkey: ((key: string) => void) | null = null;

  attach(target: Window): void {
    target.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.held.add(k);
      if ('12345cvwx'.includes(k)) this.onHotkey?.(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.held.delete(e.key.toLowerCase()));
    target.addEventListener('blur', () => this.held.clear());
  }

  /** Sample current intent. Called once per simulation tick, not per frame. */
  sample(dt: number): Command {
    const left = this.held.has('a') || this.held.has('arrowleft');
    const right = this.held.has('d') || this.held.has('arrowright');
    const more = this.held.has('w') || this.held.has('arrowup');
    const less = this.held.has('s') || this.held.has('arrowdown');

    if (more) this.sail = Math.min(1, this.sail + dt * 0.8);
    if (less) this.sail = Math.max(0, this.sail - dt * 0.8);

    const turn = (right ? 1 : 0) - (left ? 1 : 0);
    return { seq: this.seq++, turn, sail: this.sail };
  }

  get sailTrim(): number { return this.sail; }
}
