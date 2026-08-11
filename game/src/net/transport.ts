/* The client/server seam.
 *
 * Everything the client knows about the world arrives through this interface,
 * and everything it wants goes out through it. Today the implementation runs
 * the simulation in the same process; a WebSocket implementation later
 * satisfies the same contract without the client changing.
 *
 * MUST NOT import Babylon.
 */

import type { Command, ControlMessage, Snapshot } from '../sim/types.ts';

export interface Transport {
  /** Send one tick of intent. Fire and forget — never returns state. */
  sendCommand(cmd: Command): void;
  /** Out-of-band request (debug affordances in the slice). */
  sendControl(msg: ControlMessage): void;
  /** Register the sink for authoritative state. */
  onSnapshot(fn: (snap: Snapshot) => void): void;
  /** Which ship this client controls. */
  localShipId(): number;
  /** Drive time forward. `nowMs` is client wall-clock. */
  update(nowMs: number): void;
  /** Simulated one-way latency in ms. */
  latencyMs: number;
}
