import { EventEmitter } from "node:events";
import type { Segment } from "./types.js";

/** Fan-out of new items (transcript lines, chat messages) to connected viewers. One process only; swap for Redis pub/sub to scale out. */
export class Bus<T = Segment> {
  private ee = new EventEmitter().setMaxListeners(0);

  publish(roomId: string, item: T) {
    this.ee.emit(roomId, item);
  }

  subscribe(roomId: string, fn: (item: T) => void) {
    this.ee.on(roomId, fn);
    return () => {
      this.ee.off(roomId, fn);
    };
  }

  listenerCount(roomId: string) {
    return this.ee.listenerCount(roomId);
  }
}
