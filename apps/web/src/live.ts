// Shared plumbing for the live broadcast: this tab's peer id and a local hub for signals from the room stream.
import type { Signal } from "./api";

type Listener = (s: Signal) => void;
const listeners = new Set<Listener>();

export const signals = {
  emit(s: Signal) {
    listeners.forEach((l) => l(s));
  },
  on(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export const peerId = crypto.randomUUID();
export const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
