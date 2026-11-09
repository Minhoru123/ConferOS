import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { addLine, reset } from "../server/transcript.js";
import { merge, search } from "../server/search.js";

beforeEach(() => reset());

test("a line found both ways ranks first and is not labelled as found by meaning", () => {
  const hits = merge([7, 3], [3, 5]);
  assert.deepEqual(hits.map((h) => [h.id, h.byMeaning]), [[3, false], [7, false], [5, true]]);
  assert.equal(hits[0].score, 1 / 61 + 1 / 60);
});

test("ties keep meaning results first, as in TalkLens", () => {
  assert.deepEqual(merge([2], [9]).map((h) => h.id), [9, 2]);
});

test("merge stops at the limit", () => {
  assert.equal(merge([1, 2, 3], [4, 5, 6], 4).length, 4);
});

test("without Elasticsearch, search runs in memory over both languages", async () => {
  addLine({ en: "Lunch will be at two o'clock.", es: "El almuerzo será a las dos." });
  addLine({ en: "Submissions close at five thirty." });
  const en = await search("LUNCH");
  assert.equal(en.mode, "memory");
  assert.deepEqual(en.results.map((r) => [r.id, r.byMeaning]), [[1, false]]);
  assert.deepEqual((await search("almuerzo")).results.map((r) => r.id), [1]);
  assert.deepEqual((await search("party")).results, []);
});
