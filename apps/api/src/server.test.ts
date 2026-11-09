import { describe, expect, it } from "vitest";
import { SEED_ROOMS } from "./seed.js";
import { buildServer } from "./server.js";
import { MemoryStore } from "./store.js";

process.env.NODE_ENV = "test";

async function setup() {
  const app = await buildServer({ store: new MemoryStore(SEED_ROOMS) });
  const say = (text: string, room = "main") => app.inject({ method: "POST", url: `/api/rooms/${room}/segments`, payload: { speaker: "Organizer", text } });
  return { app, say };
}

describe("api", () => {
  it("reports health", async () => {
    const { app } = await setup();
    const res = await app.inject({ url: "/health" });
    expect(res.json()).toEqual({ ok: true });
  });

  it("stores segments in order and lists them", async () => {
    const { app, say } = await setup();
    await say("Building starts at eleven.");
    await say("Lunch will be at one o'clock.");
    const res = await app.inject({ url: "/api/rooms/main/segments" });
    const segs = res.json() as { seq: number; text: string }[];
    expect(segs.map((s) => s.seq)).toEqual([1, 2]);
    expect(segs[1]!.text).toContain("Lunch");
  });

  it("filters segments by query", async () => {
    const { app, say } = await setup();
    await say("Building starts at eleven.");
    await say("Lunch will be at one o'clock.");
    const res = await app.inject({ url: "/api/rooms/main/segments?q=lunch" });
    expect(res.json()).toHaveLength(1);
  });

  it("answers only from what was said, with a citation", async () => {
    const { app, say } = await setup();
    await say("Lunch will be at one o'clock. Vegetarian options are on the left.");
    const hit = await app.inject({ method: "POST", url: "/api/rooms/main/ask", payload: { question: "When is lunch?" } });
    expect(hit.json().citations).toHaveLength(1);
    expect(hit.json().answer).toContain("Lunch");
    const miss = await app.inject({ method: "POST", url: "/api/rooms/main/ask", payload: { question: "Who won the panel prize?" } });
    expect(miss.json().citations).toHaveLength(0);
  });

  it("returns 404 for unknown rooms and 400 for bad input", async () => {
    const { app } = await setup();
    expect((await app.inject({ url: "/api/rooms/nope/segments" })).statusCode).toBe(404);
    const bad = await app.inject({ method: "POST", url: "/api/rooms/main/segments", payload: { speaker: "", text: "" } });
    expect(bad.statusCode).toBe(400);
  });

  it("creates team rooms", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "POST", url: "/api/rooms", payload: { name: "Ctrl Alt Build Demo", video: true } });
    expect(res.statusCode).toBe(201);
    expect(res.json().kind).toBe("team");
    const rooms = (await app.inject({ url: "/api/rooms" })).json() as unknown[];
    expect(rooms.length).toBe(SEED_ROOMS.length + 1);
  });
});

describe("presenter access and caption metadata", () => {
  it("lets anyone add lines when no key is set, and reports that", async () => {
    const app = await buildServer({ store: new MemoryStore(SEED_ROOMS), presenterKey: "" });
    expect((await app.inject({ url: "/api/config" })).json()).toEqual({ presenterKeyRequired: false });
    const res = await app.inject({ method: "POST", url: "/api/rooms/main/segments", payload: { speaker: "A", text: "Hello." } });
    expect(res.statusCode).toBe(201);
  });

  it("requires the presenter key to add lines when one is set, but not to read or ask", async () => {
    const app = await buildServer({ store: new MemoryStore(SEED_ROOMS), presenterKey: "secret" });
    expect((await app.inject({ url: "/api/config" })).json()).toEqual({ presenterKeyRequired: true });
    const payload = { speaker: "A", text: "Lunch is at one." };
    expect((await app.inject({ method: "POST", url: "/api/rooms/main/segments", payload })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/rooms/main/segments", payload, headers: { "x-presenter-key": "wrong" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/rooms/main/segments", payload, headers: { "x-presenter-key": "secret" } })).statusCode).toBe(201);
    expect((await app.inject({ url: "/api/rooms/main/segments" })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/rooms/main/ask", payload: { question: "When is lunch?" } })).statusCode).toBe(200);
  });

  it("keeps the source and lag of microphone lines, and rejects bad values", async () => {
    const app = await buildServer({ store: new MemoryStore(SEED_ROOMS), presenterKey: "" });
    const ok = await app.inject({ method: "POST", url: "/api/rooms/main/segments", payload: { speaker: "A", text: "Spoken.", source: "mic", lagMs: 850 } });
    expect(ok.json()).toMatchObject({ source: "mic", lagMs: 850 });
    const listed = (await app.inject({ url: "/api/rooms/main/segments" })).json() as { lagMs?: number }[];
    expect(listed[0]!.lagMs).toBe(850);
    for (const bad of [{ lagMs: -1 }, { lagMs: 1.5 }, { lagMs: 999999 }, { source: "radio" }]) {
      const res = await app.inject({ method: "POST", url: "/api/rooms/main/segments", payload: { speaker: "A", text: "x", ...bad } });
      expect(res.statusCode).toBe(400);
    }
  });
});

describe("client errors", () => {
  it("returns 400, not 500, for a malformed JSON body", async () => {
    const app = await buildServer({ store: new MemoryStore(SEED_ROOMS), presenterKey: "" });
    const res = await app.inject({ method: "POST", url: "/api/rooms/main/segments", headers: { "content-type": "application/json" }, payload: "{not json" });
    expect(res.statusCode).toBe(400);
  });
});


describe("team zones and chat", () => {
  it("hides private team zones from the room list and lets people join with the code", async () => {
    const app = await buildServer({ store: new MemoryStore(SEED_ROOMS), presenterKey: "" });
    const made = (await app.inject({ method: "POST", url: "/api/rooms", payload: { name: "Our zone", kind: "team", priv: true } })).json() as { id: string; code: string };
    expect(made.code).toMatch(/^[0-9A-F]{6}$/);
    const listed = (await app.inject({ url: "/api/rooms" })).json() as { id: string; code?: string }[];
    expect(listed.some((r) => r.id === made.id)).toBe(false);
    expect(listed.every((r) => r.code === undefined)).toBe(true);
    expect((await app.inject({ url: `/api/rooms/${made.id}/segments` })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/rooms/${made.id}/segments?code=${made.code.toLowerCase()}` })).statusCode).toBe(200);
    const joined = await app.inject({ method: "POST", url: "/api/rooms/join", payload: { code: made.code } });
    expect(joined.json().id).toBe(made.id);
    expect((await app.inject({ method: "POST", url: "/api/rooms/join", payload: { code: "ZZZZZZ" } })).statusCode).toBe(404);
  });

  it("answers @ai questions in chat from the transcript, with a citation", async () => {
    const app = await buildServer({ store: new MemoryStore(SEED_ROOMS), presenterKey: "" });
    await app.inject({ method: "POST", url: "/api/rooms/main/segments", payload: { speaker: "Organizer", text: "Lunch will be at one o'clock." } });
    await app.inject({ method: "POST", url: "/api/rooms/main/messages", payload: { author: "Ana", text: "Hi all" } });
    await app.inject({ method: "POST", url: "/api/rooms/main/messages", payload: { author: "Ana", text: "@ai when is lunch?" } });
    const msgs = (await app.inject({ url: "/api/rooms/main/messages" })).json() as { author: string; bot?: boolean; text: string; citations?: unknown[] }[];
    expect(msgs).toHaveLength(3);
    expect(msgs[2]!.bot).toBe(true);
    expect(msgs[2]!.text).toContain("Lunch");
    expect(msgs[2]!.citations).toHaveLength(1);
  });
});

describe("live broadcast signaling", () => {
  it("relays signals to the room and checks team zone codes", async () => {
    const app = await buildServer({ store: new MemoryStore(SEED_ROOMS), presenterKey: "" });
    const ok = await app.inject({ method: "POST", url: "/api/rooms/main/signal", payload: { from: "a", to: "broadcaster", type: "join" } });
    expect(ok.statusCode).toBe(202);
    const bad = await app.inject({ method: "POST", url: "/api/rooms/main/signal", payload: { from: "a", to: "b", type: "nonsense" } });
    expect(bad.statusCode).toBe(400);
  });
});

describe("organizer stats", () => {
  it("counts lines, AI questions and caption lag for a room", async () => {
    const app = await buildServer({ store: new MemoryStore(SEED_ROOMS), presenterKey: "" });
    for (const lagMs of [400, 600, 900]) await app.inject({ method: "POST", url: "/api/rooms/main/segments", payload: { speaker: "A", text: "Lunch is at one.", source: "mic", lagMs } });
    await app.inject({ method: "POST", url: "/api/rooms/main/messages", payload: { author: "Ana", text: "@ai when is lunch?" } });
    const s = (await app.inject({ url: "/api/rooms/main/stats" })).json();
    expect(s).toMatchObject({ lines: 3, messages: 2, aiQuestions: 1, lagP50: 600, lagP95: 900 });
  });
});
