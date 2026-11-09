// Speaker pacing, ported from TalkLens (EngagementEndpoints.cs "pace"): words a minute over the last
// minute of speech and the median caption lag, so the speaker screen can say "Slow down a little".
// Only microphone lines count: replayed and typed lines are not the speaker talking.
import { events } from "./transcript.js";

const WINDOW_MS = 60000; // words a minute are measured over the last minute
const WARMUP_MS = 20000; // report 0 until there are 20 s of speech to measure
const FAST_ABOVE = 170; // words a minute
const BEHIND_MS = 6000; // median caption lag
const LAG_SAMPLES = 200;

let startedAt = null; // first spoken line since the last reset
let spoken = []; // { at, words }
let lags = [];

events.on("reset", () => {
  startedAt = null;
  spoken = [];
  lags = [];
});

events.on("line", (line) => {
  if (line.source !== "mic") return;
  startedAt ??= line.at;
  spoken.push({ at: line.at, words: line.en.split(/\s+/).filter(Boolean).length });
  if (Number.isFinite(line.lagMs)) {
    lags.push(line.lagMs);
    if (lags.length > LAG_SAMPLES) lags.shift();
  }
});

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.5))];
}

export function pace(now = Date.now()) {
  if (startedAt === null) return { live: false };
  const window = Math.min(WINDOW_MS, now - startedAt);
  spoken = spoken.filter((s) => s.at >= now - WINDOW_MS);
  const words = spoken.filter((s) => s.at >= now - window).reduce((n, s) => n + s.words, 0);
  const wordsPerMinute = window < WARMUP_MS ? 0 : Math.floor((words * 60000) / window);
  const behindMs = median(lags);
  return {
    live: true,
    wordsPerMinute,
    behindMs,
    tooFast: wordsPerMinute > FAST_ABOVE,
    behind: behindMs > BEHIND_MS,
    fastAbove: FAST_ABOVE,
  };
}
