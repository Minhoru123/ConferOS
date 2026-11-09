import express from "express";
import { fileURLToPath } from "node:url";
import { addLine, allLines, events } from "./transcript.js";
import { startReplay } from "./replay.js";
import { pace } from "./pacing.js";
import { addQuestion, groups, setStatus, shownQuestion, STATUSES } from "./questions.js";

const PORT = Number(process.env.PORT) || 3000;
const PRESENTER_KEY = process.env.PRESENTER_KEY || "";
const REPLAY_MS = Number(process.env.REPLAY_INTERVAL_MS) || 6000;

const app = express();
app.use(express.json({ limit: "16kb" }));
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));

// Adding lines and restarting the demo need the presenter key, when one is configured.
function presenterOnly(req, res, next) {
  if (PRESENTER_KEY && req.get("x-presenter-key") !== PRESENTER_KEY) {
    return res.status(401).json({ error: "Presenter key required" });
  }
  next();
}

// Live transcript over Server-Sent Events: the whole transcript on connect and after a reset,
// then one "line" event per new line.
app.get("/api/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // stop proxies from buffering the stream
  });
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const onLine = (line) => send("line", line);
  const onReset = () => send("snapshot", []);
  send("snapshot", allLines());
  events.on("line", onLine);
  events.on("reset", onReset);
  const ping = setInterval(() => res.write(": ping\n\n"), 25000); // keeps idle connections open
  req.on("close", () => {
    clearInterval(ping);
    events.off("line", onLine);
    events.off("reset", onReset);
  });
});

app.post("/api/lines", presenterOnly, (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const who = typeof req.body?.who === "string" && req.body.who.trim() ? req.body.who.trim().slice(0, 60) : "Speaker";
  if (!text || text.length > 1000) return res.status(400).json({ error: "text must be 1 to 1000 characters" });
  const source = req.body.source === "mic" ? "mic" : "typed";
  const lagMs = Number.isFinite(req.body.lagMs) ? Math.min(Math.max(req.body.lagMs, 0), 120000) : undefined;
  res.status(201).json(addLine({ who, en: text, source, lagMs }));
});

// Speaker screen polls this every few seconds.
app.get("/api/pace", (req, res) => res.json(pace()));

// At most `max` requests a minute per client address.
const recent = new Map();
function rateLimited(key, max) {
  const now = Date.now();
  const hits = (recent.get(key) || []).filter((t) => t > now - 60000);
  const over = hits.length >= max;
  if (!over) hits.push(now);
  recent.set(key, hits);
  return over;
}

// Questions for the speaker: only the moderator sees them, and nothing about the sender is kept.
app.post("/api/questions", (req, res) => {
  const text = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!text || text.length > 500) return res.status(400).json({ error: "question_length" });
  if (rateLimited(req.ip, 6)) return res.status(429).json({ error: "rate_limited" });
  addQuestion(text);
  res.status(201).end();
});
app.get("/api/questions", presenterOnly, (req, res) => res.json(groups()));
app.post("/api/questions/:id/status", presenterOnly, (req, res) => {
  const status = req.body?.status;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(", ")}` });
  if (!setStatus(Number(req.params.id), status)) return res.status(404).json({ error: "No such question" });
  res.json(groups());
});
// The question on the speaker screen, if any. Public, since it is meant to be seen.
app.get("/api/questions/shown", (req, res) => res.json(shownQuestion()));

app.post("/api/replay", presenterOnly, (req, res) => {
  startReplay(REPLAY_MS);
  res.status(202).end();
});

if (process.env.REPLAY !== "off") startReplay(REPLAY_MS);
app.listen(PORT, () => {
  console.log(`Backchannel on http://localhost:${PORT} (presenter page: /presenter.html)`);
});
