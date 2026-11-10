import { afterEach, describe, expect, it, vi } from "vitest";
import { openaiGlossModel } from "./openaiGloss.js";

const signal = new AbortController().signal;
const reply = (body: unknown, ok = true) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok, json: async () => body })));

afterEach(() => vi.unstubAllGlobals());

describe("openaiGlossModel", () => {
  it("returns the glosses and sends the key and model", async () => {
    reply({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ glosses: ["lunch", " "] }) } }] });
    expect(await openaiGlossModel("key", "m")("sys", "Sentence: lunch", signal)).toEqual(["lunch"]);
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer key");
    expect(JSON.parse(init!.body as string).model).toBe("m");
  });

  it("returns null on an error or a cut-off answer", async () => {
    reply({}, false);
    expect(await openaiGlossModel("key", "m")("sys", "x", signal)).toBeNull();
    reply({ choices: [{ finish_reason: "length", message: { content: "{" } }] });
    expect(await openaiGlossModel("key", "m")("sys", "x", signal)).toBeNull();
  });
});
