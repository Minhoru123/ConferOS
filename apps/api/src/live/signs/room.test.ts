import { describe, expect, it } from "vitest";
import { Bus } from "../../bus.js";
import { SEED_ROOMS } from "../../seed.js";
import { buildServer } from "../../server.js";
import { MemoryStore } from "../../store.js";
import { SignLexicon } from "./lexicon.js";
import { SignTranslator, type SignTranslation } from "./translator.js";

process.env.NODE_ENV = "test";

describe("signing in a room", () => {
  it("signs transcript lines only while someone has the avatar on", async () => {
    const lexicon = new SignLexicon(`<sigml><hns_sign gloss="lunch"><a /></hns_sign></sigml>`);
    const signBus = new Bus<SignTranslation>();
    const app = await buildServer({ store: new MemoryStore(SEED_ROOMS), presenterKey: "", signBus, signTranslator: new SignTranslator(lexicon, null, 1000) });
    const say = () => app.inject({ method: "POST", url: "/api/rooms/main/segments", payload: { speaker: "Organizer", text: "lunch now" } });
    const seen: SignTranslation[] = [];

    await say();
    await new Promise((done) => setTimeout(done, 30));
    expect(seen).toHaveLength(0);

    signBus.subscribe("main", (item) => seen.push(item));
    await say();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0]!.sigml).toContain(`gloss="lunch"`);
  });
});
