// Transcript search on Elasticsearch, ported from TalkLens (ElasticIndex.cs, VectorIndex.cs): words and
// meaning are searched at once and merged, and lines found only by meaning are labelled. Lines are copied
// to Elasticsearch every 2 s; without it, or while it is down, search runs on the lines in memory.
// Unlike TalkLens, every line gets its own vector, so a hit always points at one line to jump to.
import { allLines, events } from "./transcript.js";

const ES_URL = (process.env.ELASTIC_URL || "").replace(/\/$/, "");
const ES_AUTH = process.env.ELASTIC_API_KEY
  ? `ApiKey ${process.env.ELASTIC_API_KEY}`
  : process.env.ELASTIC_PASSWORD
    ? `Basic ${Buffer.from(`${process.env.ELASTIC_USERNAME || "elastic"}:${process.env.ELASTIC_PASSWORD}`).toString("base64")}`
    : null;
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const INDEX = process.env.ELASTIC_INDEX || "backchannel-lines";
const MODEL = "text-embedding-3-small";
const DIMS = 512;
const MODEL_TAG = `${MODEL}/${DIMS}`; // stored with each vector so vectors from different models are never compared
const MAX_HITS = 40;
const RANK_OFFSET = 60;
const MIN_COSINE = 0.3; // TalkLens measured right text at 0.36 to 0.51 and wrong text at 0.24 or less
const SYNC_MS = 2000;

const MAPPING = {
  settings: { analysis: { analyzer: { folded: { tokenizer: "standard", filter: ["lowercase", "asciifolding"] } } } },
  mappings: {
    properties: {
      talk: { type: "long" },
      line_id: { type: "long" },
      model: { type: "keyword" },
      text: {
        type: "text",
        analyzer: "folded",
        fields: { en: { type: "text", analyzer: "english" }, es: { type: "text", analyzer: "spanish" } },
      },
      vector: { type: "dense_vector", dims: DIMS, similarity: "cosine", index_options: { type: "int8_hnsw" } },
    },
  },
};

let talk = Date.now(); // a new id on every restart, so earlier transcripts drop out of results
let wordsDone = 0; // highest line id copied with its text
let meaningDone = 0; // highest line id copied with its vector
let ready = false; // the index exists and the last request to Elasticsearch worked
let syncing = false;

events.on("reset", () => {
  talk = Date.now();
  wordsDone = 0;
  meaningDone = 0;
});

async function es(method, path, body, timeoutMs = 5000) {
  const bulk = path.startsWith("/_bulk");
  const res = await fetch(ES_URL + path, {
    method,
    headers: { "Content-Type": bulk ? "application/x-ndjson" : "application/json", ...(ES_AUTH && { Authorization: ES_AUTH }) },
    body: bulk ? body.map((x) => JSON.stringify(x)).join("\n") + "\n" : body && JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) throw Object.assign(new Error("Elasticsearch request failed"), { status: res.status, type: json.error?.type });
  return json;
}

async function embed(texts, timeoutMs) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: MODEL, input: texts, dimensions: DIMS }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw Object.assign(new Error("Embedding request failed"), { status: res.status });
  const { data } = await res.json();
  return data
    .sort((a, b) => a.index - b.index)
    .map(({ embedding }) => {
      const length = Math.hypot(...embedding) || 1;
      return embedding.map((x) => x / length);
    });
}

// Errors are logged by kind only, so what people search for never reaches a log.
const why = (e) => `${e.name}${e.status ? ` ${e.status}` : ""}${e.type ? ` ${e.type}` : ""}`;

async function ensureIndex() {
  try {
    await es("PUT", `/${INDEX}`, MAPPING);
  } catch (e) {
    if (e.type !== "resource_already_exists_exception") throw e;
  }
}

async function sync() {
  if (syncing) return;
  syncing = true;
  const current = talk;
  try {
    if (!ready) {
      await ensureIndex();
      ready = true;
    }
    const lines = allLines();
    const fresh = lines.filter((l) => l.id > wordsDone);
    if (fresh.length) {
      await es("POST", "/_bulk?refresh=true", fresh.flatMap((l) => [
        { index: { _index: INDEX, _id: `${current}-${l.id}` } },
        { talk: current, line_id: l.id, text: [l.en, l.es].filter(Boolean).join("\n") },
      ]));
      if (talk === current) wordsDone = fresh.at(-1).id;
    }
    const unembedded = lines.filter((l) => l.id > meaningDone && l.id <= wordsDone);
    if (OPENAI_KEY && unembedded.length && talk === current) {
      const vectors = await embed(unembedded.map((l) => l.en), 10000);
      await es("POST", "/_bulk?refresh=true", unembedded.flatMap((l, i) => [
        { update: { _index: INDEX, _id: `${current}-${l.id}` } },
        { doc: { vector: vectors[i], model: MODEL_TAG } },
      ]));
      if (talk === current) meaningDone = unembedded.at(-1).id;
    }
  } catch (e) {
    if (e.message.startsWith("Elasticsearch")) ready = false;
    console.warn(`Search sync failed (${why(e)}), will retry`);
  } finally {
    syncing = false;
  }
}

// Reciprocal rank fusion with TalkLens's 0-based rank: a line scores 1/(60+rank) in each list it is in.
// A line counts as found by meaning only when the word search did not find it.
export function merge(wordIds, meaningIds, limit = MAX_HITS) {
  const hits = new Map();
  meaningIds.forEach((id, i) => hits.set(id, { id, score: 1 / (RANK_OFFSET + i), byMeaning: true }));
  wordIds.forEach((id, i) => {
    const hit = hits.get(id);
    if (hit) {
      hit.score += 1 / (RANK_OFFSET + i);
      hit.byMeaning = false;
    } else hits.set(id, { id, score: 1 / (RANK_OFFSET + i), byMeaning: false });
  });
  return [...hits.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

// null when meaning search cannot run (no key, nothing embedded yet, over the rate limit, or it failed).
async function meaningIds(q, current, allowed) {
  if (!OPENAI_KEY || !meaningDone || !allowed) return null;
  try {
    const [vector] = await embed([q], 2000);
    const r = await es("POST", `/${INDEX}/_search`, {
      size: MAX_HITS,
      _source: ["line_id"],
      knn: {
        field: "vector",
        query_vector: vector,
        k: MAX_HITS,
        num_candidates: Math.max(100, MAX_HITS * 5),
        filter: [{ term: { model: MODEL_TAG } }, { term: { talk: current } }],
      },
    }, 2000);
    return r.hits.hits.filter((h) => h._score * 2 - 1 >= MIN_COSINE).map((h) => h._source.line_id);
  } catch (e) {
    console.warn(`Meaning search failed (${why(e)})`);
    return null;
  }
}

function inMemory(q) {
  const needle = q.toLowerCase();
  return allLines()
    .filter((l) => [l.en, l.es].some((t) => t && t.toLowerCase().includes(needle)))
    .map((l) => ({ id: l.id, byMeaning: false }));
}

function withLines(hits) {
  const lines = allLines();
  return hits
    .filter((h) => lines[h.id - 1])
    .map(({ id, byMeaning }) => {
      const l = lines[id - 1];
      return { id, t: l.t, who: l.who, text: l.en, byMeaning };
    });
}

// mode: "hybrid" (words and meaning), "words" (Elasticsearch, words only) or "memory" (no Elasticsearch).
export async function search(q, meaningAllowed = true) {
  if (ES_URL && ready) {
    const current = talk;
    try {
      const [words, meaning] = await Promise.all([
        es("POST", `/${INDEX}/_search`, {
          size: MAX_HITS,
          _source: ["line_id"],
          query: {
            bool: {
              must: { multi_match: { query: q, fields: ["text", "text.en", "text.es"], fuzziness: "AUTO", minimum_should_match: "2<60%" } },
              filter: [{ term: { talk: current } }],
            },
          },
        }, 2000),
        meaningIds(q, current, meaningAllowed),
      ]);
      const wordIds = words.hits.hits.map((h) => h._source.line_id);
      return { mode: meaning ? "hybrid" : "words", results: withLines(merge(wordIds, meaning || [])) };
    } catch (e) {
      console.warn(`Search failed (${why(e)}), searching in memory`);
    }
  }
  return { mode: "memory", results: withLines(inMemory(q)) };
}

export function startSync() {
  if (!ES_URL) {
    console.log("Search: in memory (set ELASTIC_URL to use Elasticsearch)");
    return;
  }
  console.log(`Search: Elasticsearch index ${INDEX}, meaning search ${OPENAI_KEY ? "on" : "off (no OPENAI_API_KEY)"}`);
  sync();
  setInterval(sync, SYNC_MS);
}
