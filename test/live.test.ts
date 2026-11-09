import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { WebSocket, WebSocketServer } from "ws";
import { createApp } from "../src/app.ts";
import { LineAssembler } from "../src/captions/lineAssembler.ts";
import { SignLexicon } from "../src/signs/lexicon.ts";
import { SignTranslator } from "../src/signs/translator.ts";

const results = (transcript: string, is_final: boolean, speech_final: boolean) =>
  JSON.stringify({ type: "Results", is_final, speech_final, channel: { alternatives: [{ transcript }] } });

test("partial results build one line, then a new line starts", () => {
  const lines = new LineAssembler("Speaker", () => new Date(2026, 10, 9, 10, 5));
  assert.deepEqual(lines.add({ text: "lunch", isFinal: false, speechFinal: false }), { id: 1, t: "10:05", who: "Speaker", text: "lunch", final: false });
  assert.equal(lines.add({ text: "lunch is", isFinal: true, speechFinal: false })?.final, false);
  const end = lines.add({ text: "at one.", isFinal: true, speechFinal: true });
  assert.deepEqual([end?.id, end?.text, end?.final], [1, "lunch is at one.", true]);
  assert.equal(lines.add({ text: "next", isFinal: false, speechFinal: false })?.id, 2);
});

test("microphone audio becomes captions and signs for every viewer", async (t) => {
  const audio: Buffer[] = [];
  const fakeDeepgram = new WebSocketServer({ port: 0 });
  let auth = "";
  fakeDeepgram.on("connection", (socket, request) => {
    auth = request.headers.authorization ?? "";
    socket.on("message", (data, isBinary) => {
      if (!isBinary) return;
      audio.push(data as Buffer);
      socket.send(results("eat", false, false));
      socket.send(results("eat time", true, true));
    });
  });

  const lexicon = new SignLexicon(`<sigml><hns_sign gloss="eat"><a /></hns_sign><hns_sign gloss="time"><b /></hns_sign></sigml>`);
  const server = createApp({
    deepgramKey: "test-key",
    deepgramUrl: `ws://localhost:${(fakeDeepgram.address() as AddressInfo).port}`,
    language: "en",
    speakerKey: "secret",
    translator: new SignTranslator(lexicon, async () => ["time", "eat"], 1000),
  });
  await new Promise<void>((done) => server.listen(0, done));
  const port = (server.address() as AddressInfo).port;
  t.after(() => { server.closeAllConnections(); server.close(); fakeDeepgram.close(); });

  const viewer = new WebSocket(`ws://localhost:${port}/ws`);
  const received: any[] = [];
  const signsArrived = new Promise<void>((done) => {
    viewer.on("message", (data) => {
      const message = JSON.parse(data.toString());
      received.push(message);
      if (message.type === "signs") done();
    });
  });
  await new Promise((done) => viewer.on("open", done));
  viewer.send(JSON.stringify({ type: "signs", on: true }));
  await new Promise((done) => setTimeout(done, 30));

  const denied = new WebSocket(`ws://localhost:${port}/ws?role=speaker&key=wrong`);
  assert.equal(await new Promise((done) => denied.on("close", done)), 1008);

  const speaker = new WebSocket(`ws://localhost:${port}/ws?role=speaker&key=secret`);
  await new Promise((done) => speaker.on("open", done));
  speaker.send(Buffer.from("audio-header"), { binary: true });
  await signsArrived;

  assert.equal(auth, "Token test-key");
  assert.equal(audio[0].toString(), "audio-header");
  assert.deepEqual(received.filter((m) => m.type === "caption").map((m) => [m.text, m.final]), [["eat", false], ["eat time", true]]);
  const signs = received.find((m) => m.type === "signs");
  assert.equal(signs.sigml, `<sigml><hns_sign gloss="time"><b /></hns_sign><hns_sign gloss="eat"><a /></hns_sign></sigml>`);

  viewer.close();
  speaker.close();
});
