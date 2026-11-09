import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { reset } from "../server/transcript.js";
import { addQuestion, groups, keywords, setStatus, shownQuestion } from "../server/questions.js";

beforeEach(() => reset());

test("keywords drop accents, punctuation, short and common words", () => {
  assert.deepEqual([...keywords("¿Cuándo es la demo de Kubernetes?")], ["demo", "kubernetes"]);
  assert.deepEqual([...keywords("What is the deadline for the README?")], ["deadline", "readme"]);
});

test("repeats that differ only in small words and punctuation are grouped", () => {
  addQuestion("When is the submission deadline?");
  addQuestion("when's the submission deadline");
  addQuestion("Is there a quiet room?");
  const [first, second] = groups();
  assert.equal(first.text, "When is the submission deadline?");
  assert.equal(first.count, 2);
  assert.deepEqual(first.variants, ["when's the submission deadline"]);
  assert.equal(second.count, 1);
});

test("different question words are not enough to group without the AI step", () => {
  // TalkLens catches this with its language-model fallback, which this port leaves out for now
  addQuestion("When is the submission deadline?");
  addQuestion("what's the submission deadline");
  assert.equal(groups().length, 2);
});

test("sharing a topic is not enough", () => {
  addQuestion("How do I deploy the demo to Kubernetes?");
  addQuestion("Which Kubernetes cluster are the judges using?");
  assert.equal(groups().length, 2);
});

test("most asked first, then oldest; the shown group always on top", () => {
  addQuestion("Where is the quiet room?");
  addQuestion("Is lunch vegetarian?");
  addQuestion("is lunch vegetarian");
  assert.deepEqual(groups().map((g) => g.text), ["Is lunch vegetarian?", "Where is the quiet room?"]);
  setStatus(1, "shown");
  assert.deepEqual(groups().map((g) => g.text), ["Where is the quiet room?", "Is lunch vegetarian?"]);
});

test("only one group is shown at a time, and a repeat joins it as shown", () => {
  addQuestion("Where is the quiet room?");
  addQuestion("Is lunch vegetarian?");
  setStatus(1, "shown");
  setStatus(2, "shown");
  assert.deepEqual(groups().map((g) => [g.id, g.status]), [[2, "shown"], [1, "open"]]);
  addQuestion("is the lunch vegetarian");
  assert.deepEqual(shownQuestion(), { text: "Is lunch vegetarian?", count: 2 });
});

test("answered and dismissed groups do not take repeats", () => {
  addQuestion("Is lunch vegetarian?");
  setStatus(1, "answered");
  addQuestion("is lunch vegetarian");
  assert.equal(groups().length, 2);
});

test("unknown group cannot change status; restart clears questions", () => {
  assert.equal(setStatus(99, "shown"), false);
  addQuestion("Anything?");
  reset();
  assert.deepEqual(groups(), []);
  assert.equal(shownQuestion(), null);
});
