/* In-process transport.
 *
 * Runs the authoritative simulation locally, but everything still crosses the
 * Transport interface and everything is delayed by a configurable latency.
 * That delay is the point: with zero latency the client's interpolation
 * buffer is never exercised, the seams silently rot, and the problems all
 * surface on the day real networking arrives instead of today.
 *
 * MUST NOT import Babylon.
 */

import { World } from '../sim/world.ts';
import { TICK_MS, type Command, type ControlMessage, type Snapshot } from '../sim/types.ts';
import type { Transport } from './transport.ts';

interface Delayed<T> { at: number; payload: T }

export interface LocalTransportOptions {
  latencyMs?: number;
  world: World;
  localShipId: number;
}

export class LocalTransport implements Transport {
  latencyMs: number;

  private world: World;
  private shipId: number;
  private sink: ((s: Snapshot) => void) | null = null;

  private toServer: Delayed<Command | ControlMessage>[] = [];
  private toClient: Delayed<Snapshot>[] = [];

  private started = false;
  private accumulator = 0;
  private lastNow = 0;

  constructor(opts: LocalTransportOptions) {
    this.world = opts.world;
    this.shipId = opts.localShipId;
    this.latencyMs = opts.latencyMs ?? 80;
  }

  localShipId(): number { return this.shipId; }

  sendCommand(cmd: Command): void {
    this.toServer.push({ at: this.lastNow + this.latencyMs, payload: cmd });
  }

  sendControl(msg: ControlMessage): void {
    this.toServer.push({ at: this.lastNow + this.latencyMs, payload: msg });
  }

  onSnapshot(fn: (snap: Snapshot) => void): void { this.sink = fn; }

  update(nowMs: number): void {
    if (!this.started) {
      this.started = true;
      this.lastNow = nowMs;
      return;
    }
    // Clamp the frame delta so a background tab does not come back and run
    // hundreds of catch-up ticks in one frame.
    const frame = Math.min(nowMs - this.lastNow, 250);
    this.lastNow = nowMs;

    // --- inbound to server ---
    let i = 0;
    while (i < this.toServer.length) {
      const item = this.toServer[i];
      if (item.at <= nowMs) {
        const p = item.payload;
        if ('kind' in p) this.world.applyControl(p);
        else this.world.applyCommand(this.shipId, p);
        this.toServer.splice(i, 1);
      } else i++;
    }

    // --- server ticks on its own fixed clock ---
    this.accumulator += frame;
    let ticked = false;
    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      this.world.step();
      ticked = true;
    }
    if (ticked) {
      this.toClient.push({ at: nowMs + this.latencyMs, payload: this.world.snapshot() });
    }

    // --- outbound to client ---
    let j = 0;
    while (j < this.toClient.length) {
      const item = this.toClient[j];
      if (item.at <= nowMs) {
        this.sink?.(item.payload);
        this.toClient.splice(j, 1);
      } else j++;
    }
  }
}
