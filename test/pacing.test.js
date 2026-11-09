import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { addLine, reset } from "../server/transcript.js";
import { pace } from "../server/pacing.js";

mock.timers.enable({ apis: ["Date"], now: 0 });
beforeEach(() => reset());

const say = (words, extra = {}) => addLine({ en: Array(words).fill("word").join(" "), source: "mic", ...extra });

test("not live until the speaker says something into the microphone", () => {
  addLine({ en: "typed line", source: "typed" });
  addLine({ en: "replayed line" });
  assert.deepEqual(pace(), { live: false });
});

test("reports 0 words a minute during the first 20 seconds", () => {
  say(100);
  mock.timers.tick(19000);
  assert.equal(pace().wordsPerMinute, 0);
});

test("flags more than 170 words a minute", () => {
  say(30);
  for (let i = 0; i < 3; i++) { mock.timers.tick(10000); say(30); }
  const p = pace(); // 120 words over 30 s
  assert.equal(p.wordsPerMinute, 240);
  assert.equal(p.tooFast, true);
});

test("170 words a minute or less is fine", () => {
  say(20);
  for (let i = 0; i < 5; i++) { mock.timers.tick(10000); say(20); }
  const p = pace(); // 120 words over 50 s
  assert.equal(p.wordsPerMinute, 144);
  assert.equal(p.tooFast, false);
});

test("only the last minute counts", () => {
  say(300);
  mock.timers.tick(61000);
  say(60);
  assert.equal(pace().wordsPerMinute, 60);
});

test("behind uses the median lag, so one slow caption does not trigger it", () => {
  say(5, { lagMs: 1000 });
  say(5, { lagMs: 1200 });
  say(5, { lagMs: 30000 });
  assert.equal(pace().behind, false);
  say(5, { lagMs: 7000 });
  say(5, { lagMs: 8000 });
  const p = pace();
  assert.equal(p.behindMs, 7000);
  assert.equal(p.behind, true);
});

test("restarting the transcript clears the pace", () => {
  say(50, { lagMs: 9000 });
  reset();
  assert.deepEqual(pace(), { live: false });
});
