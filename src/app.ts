import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { openDeepgram, type SpeechStream } from "./captions/deepgram.ts";
import { LineAssembler, type Caption } from "./captions/lineAssembler.ts";
import { LiveSigner } from "./signs/liveSigner.ts";
import type { SignTranslator } from "./signs/translator.ts";

const MAX_HISTORY = 500;
const POLICY_VIOLATION = 1008;
const SPEAKER_TAKEN = 4009;
const NOT_CONFIGURED = 4010;

export interface AppOptions {
  deepgramKey: string;
  deepgramUrl: string;
  language: string;
  speakerKey: string;
  translator: SignTranslator;
}

export function createApp(options: AppOptions): Server {
  const app = express();
  app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
  const server = createServer(app);
  const sockets = new WebSocketServer({ server, path: "/ws" });

  const history: Caption[] = [];
  const signing = new Set<WebSocket>();
  let speaker: WebSocket | null = null;

  const broadcast = (message: object, to: Iterable<WebSocket> = sockets.clients) => {
    const body = JSON.stringify(message);
    for (const client of to) if (client.readyState === WebSocket.OPEN) client.send(body);
  };

  const signer = new LiveSigner(options.translator, () => signing.size > 0, (item) => broadcast({ type: "signs", ...item }, signing));

  const publish = (caption: Caption | null) => {
    if (!caption) return;
    if (caption.final) {
      history.push(caption);
      if (history.length > MAX_HISTORY) history.shift();
    }
    broadcast({ type: "caption", ...caption });
    signer.add(caption.id, caption.text, caption.final);
  };

  const lines = new LineAssembler();

  function attachSpeaker(socket: WebSocket): void {
    speaker = socket;
    const stream: SpeechStream = openDeepgram({
      url: options.deepgramUrl,
      apiKey: options.deepgramKey,
      language: options.language,
      onResult: (result) => publish(lines.add(result)),
      onUtteranceEnd: () => publish(lines.flush()),
      onClose: () => {
        publish(lines.flush());
        if (socket.readyState === WebSocket.OPEN) socket.close(1000, "captions stopped");
      },
    });
    socket.on("message", (data, isBinary) => {
      if (isBinary) stream.send(data as Buffer);
    });
    socket.on("close", () => {
      speaker = null;
      stream.close();
    });
  }

  sockets.on("connection", (socket, request) => {
    const params = new URL(request.url ?? "/", "http://localhost").searchParams;

    if (params.get("role") === "speaker") {
      if (options.speakerKey && params.get("key") !== options.speakerKey) return socket.close(POLICY_VIOLATION, "wrong speaker key");
      if (!options.deepgramKey) return socket.close(NOT_CONFIGURED, "DEEPGRAM_API_KEY is not set");
      if (speaker) return socket.close(SPEAKER_TAKEN, "another speaker is live");
      attachSpeaker(socket);
      return;
    }

    socket.send(JSON.stringify({ type: "history", lines: history }));
    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type !== "signs") return;
        if (message.on) signing.add(socket);
        else signing.delete(socket);
      } catch {
        // Not a message this server understands.
      }
    });
    socket.on("close", () => signing.delete(socket));
  });

  return server;
}
