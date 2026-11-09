// In-memory transcript of the current talk. Other modules subscribe to "line" and "reset"
// to push, index or measure it, so this file stays the single source of truth.
import { EventEmitter } from "node:events";

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: process.env.EVENT_TZ || "America/Denver",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const lines = [];
export const events = new EventEmitter();
events.setMaxListeners(0); // one listener per connected viewer

export function allLines() {
  return lines;
}

// `t` is the event-local time shown next to the line (HH:MM); replayed lines bring their own.
export function addLine({ who = "Speaker", en, es, gist, t }) {
  const line = { id: lines.length + 1, t: t || clock.format(new Date()), at: Date.now(), who, en };
  if (es) line.es = es;
  if (gist) line.gist = gist;
  lines.push(line);
  events.emit("line", line);
  return line;
}

export function reset() {
  lines.length = 0;
  events.emit("reset");
}
