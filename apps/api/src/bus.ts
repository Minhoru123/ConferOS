import { EventEmitter } from "node:events";
import type { Segment } from "./types.js";

/** Fan-out of new transcript segments to connected viewers. One process only; swap for Redis pub/sub to scale out. */
export class Bus {
  private ee = new EventEmitter().setMaxListeners(0);

  publish(roomId: string, seg: Segment) {
    this.ee.emit(roomId, seg);
  }

  subscribe(roomId: string, fn: (seg: Segment) => void) {
    this.ee.on(roomId, fn);
    return () => {
      this.ee.off(roomId, fn);
    };
  }

  listenerCount(roomId: string) {
    return this.ee.listenerCount(roomId);
  }
}
