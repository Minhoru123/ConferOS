import { describe, expect, it } from "vitest";
import { SignLexicon } from "./lexicon.js";
import { LiveSigner, SignChunker } from "./liveSigner.js";
import { SignTranslator, type GlossModel } from "./translator.js";

const lexicon = new SignLexicon(`<sigml><hns_sign gloss="eat"><a /></hns_sign><hns_sign gloss="time"><b /></hns_sign></sigml>`);

describe("signs", () => {
  it("loads every sign in the bundled lexicon", () => {
    expect(SignLexicon.load(new URL("../../../data/signs/lexicon.sigml", import.meta.url)).glosses).toHaveLength(833);
  });

  it("only lets signs from the lexicon reach the avatar", async () => {
    const model: GlossModel = async () => ["time", "eat", "invented", "?lunch"];
    const result = await new SignTranslator(lexicon, model, 1000).translate("Lunch time");
    expect(result.sigml).toBe(`<sigml><hns_sign gloss="time"><b /></hns_sign><hns_sign gloss="eat"><a /></hns_sign></sigml>`);
    expect(result.tokens.map((t) => [t.word, t.hasSign])).toEqual([["time", true], ["eat", true], ["invented", false], ["lunch", false]]);
  });

  it("falls back to word by word when the model fails or is slow", async () => {
    const quiet = () => {};
    const failing: GlossModel = async () => {
      throw new Error("down");
    };
    expect((await new SignTranslator(lexicon, failing, 1000, quiet).translate("the time")).tokens).toEqual([{ word: "time", hasSign: true }]);

    const slow: GlossModel = (_s, _t, signal) => new Promise((_ok, fail) => signal.addEventListener("abort", () => fail(signal.reason)));
    const result = await new SignTranslator(lexicon, slow, 20, quiet).translate("eat now");
    expect(result.byModel).toBe(false);
    expect(result.tokens).toEqual([{ word: "eat", hasSign: true }, { word: "now", hasSign: false }]);
  });

  it("calls the model once for repeated text", async () => {
    let calls = 0;
    const model: GlossModel = async () => {
      calls++;
      return ["eat"];
    };
    const translator = new SignTranslator(lexicon, model, 1000);
    await translator.translate("eat");
    await translator.translate("eat");
    expect(calls).toBe(1);
  });

  it("holds back the last unfinished word and cuts at clauses", () => {
    const chunker = new SignChunker();
    expect(chunker.add("a", "one two three", false)).toEqual([]);
    expect(chunker.add("a", "one two three, four", false)).toEqual(["one two three,"]);
    expect(chunker.add("a", "one two three, four five", true)).toEqual(["four five"]);
  });

  it("sends signs in order and translates nothing while nobody watches", async () => {
    const sent: string[] = [];
    let watching = false;
    const model: GlossModel = async (_s, sentence) => {
      await new Promise((done) => setTimeout(done, sentence.includes("first") ? 30 : 1));
      return [sentence.includes("first") ? "eat" : "time"];
    };
    const signer = new LiveSigner(new SignTranslator(lexicon, model, 1000), () => watching, (item) => sent.push(item.tokens[0]!.word));

    signer.add("1", "hidden words here", true);
    await signer.drained;
    expect(sent).toEqual([]);

    watching = true;
    signer.add("2", "first", true);
    signer.add("3", "second", true);
    await signer.drained;
    expect(sent).toEqual(["eat", "time"]);
  });
});
