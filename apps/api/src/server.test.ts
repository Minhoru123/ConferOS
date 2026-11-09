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
