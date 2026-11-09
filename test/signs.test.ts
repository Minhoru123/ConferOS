import assert from "node:assert/strict";
import { test } from "node:test";
import { SignLexicon } from "../src/signs/lexicon.ts";
import { LiveSigner, SignChunker } from "../src/signs/liveSigner.ts";
import { SignTranslator, type GlossModel } from "../src/signs/translator.ts";

const lexicon = new SignLexicon(`<sigml><hns_sign gloss="eat"><a /></hns_sign><hns_sign gloss="time"><b /></hns_sign></sigml>`);

test("the bundled lexicon loads every sign", () => {
  assert.equal(SignLexicon.load("data/signs/lexicon.sigml").glosses.length, 833);
});

test("only signs in the lexicon reach the avatar", async () => {
  const model: GlossModel = async () => ["time", "eat", "invented", "?lunch"];
  const result = await new SignTranslator(lexicon, model, 1000).translate("Lunch time");
  assert.equal(result.sigml, `<sigml><hns_sign gloss="time"><b /></hns_sign><hns_sign gloss="eat"><a /></hns_sign></sigml>`);
  assert.deepEqual(result.tokens.map((t) => [t.word, t.hasSign]), [["time", true], ["eat", true], ["invented", false], ["lunch", false]]);
});

test("falls back to word by word when the model fails or is slow", async () => {
  const failing: GlossModel = async () => { throw new Error("down"); };
  assert.deepEqual((await new SignTranslator(lexicon, failing, 1000).translate("the time")).tokens, [{ word: "time", hasSign: true }]);

  const slow: GlossModel = (_s, _t, signal) => new Promise((_ok, fail) => signal.addEventListener("abort", () => fail(signal.reason)));
  // AbortSignal.timeout does not keep Node running by itself, and here nothing else would.
  const keepRunning = setTimeout(() => {}, 1000);
  const result = await new SignTranslator(lexicon, slow, 20).translate("eat now");
  clearTimeout(keepRunning);
  assert.equal(result.byModel, false);
  assert.deepEqual(result.tokens, [{ word: "eat", hasSign: true }, { word: "now", hasSign: false }]);
});

test("repeated text calls the model once", async () => {
  let calls = 0;
  const model: GlossModel = async () => { calls++; return ["eat"]; };
  const translator = new SignTranslator(lexicon, model, 1000);
  await translator.translate("eat");
  await translator.translate("eat");
  assert.equal(calls, 1);
});

test("chunker holds back the last unfinished word and cuts at clauses", () => {
  const chunker = new SignChunker();
  assert.deepEqual(chunker.add(1, "one two three", false), []);
  assert.deepEqual(chunker.add(1, "one two three, four", false), ["one two three,"]);
  assert.deepEqual(chunker.add(1, "one two three, four five", true), ["four five"]);
});

test("signs arrive in order and nothing is translated while nobody watches", async () => {
  const sent: string[] = [];
  let watching = false;
  const model: GlossModel = async (_s, sentence) => {
    await new Promise((done) => setTimeout(done, sentence.includes("first") ? 30 : 1));
    return [sentence.includes("first") ? "eat" : "time"];
  };
  const signer = new LiveSigner(new SignTranslator(lexicon, model, 1000), () => watching, (item) => sent.push(item.tokens[0].word));

  signer.add(1, "hidden words here", true);
  await signer.drained;
  assert.deepEqual(sent, []);

  watching = true;
  signer.add(2, "first", true);
  signer.add(3, "second", true);
  await signer.drained;
  assert.deepEqual(sent, ["eat", "time"]);
});
