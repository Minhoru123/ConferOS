// Questions for the speaker, ported from TalkLens (QuestionQueue.cs). Attendees send questions,
// repeats are grouped so the most asked come first, and the moderator picks one for the speaker
// screen. Nothing about who asked is stored.
import { events } from "./transcript.js";

const SAME_WORDING = 0.7; // share of keywords two questions must have in common
const MAX_CANDIDATES = 40; // most recent groups a new question is compared with
const SMALL_WORDS = new Set([
  "the", "and", "for", "you", "your", "are", "was", "what", "how", "why", "does", "did", "can", "could", "would", "will", "that", "this", "with", "about",
  "que", "como", "por", "para", "los", "las", "una", "uno", "del", "con", "esta", "este", "eso", "esto", "puede", "puedes", "cual", "cuando", "donde",
]);
export const STATUSES = ["open", "shown", "answered", "dismissed"];

let questions = []; // { id, at, text, groupId, status }; a group's id is its first question's id
events.on("reset", () => {
  questions = [];
});

// Words that carry meaning: accents and punctuation removed, short and common words dropped.
export function keywords(text) {
  const plain = text.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
  return new Set((plain.match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 2 && !SMALL_WORDS.has(w)));
}

function sameWording(text, candidates) {
  const words = keywords(text);
  if (!words.size) return null;
  for (const candidate of candidates) {
    const other = keywords(candidate.text);
    if (!other.size) continue;
    const shared = [...words].filter((w) => other.has(w)).length;
    if (shared / new Set([...words, ...other]).size >= SAME_WORDING) return candidate;
  }
  return null;
}

// A repeat joins the first open or shown group it matches and takes that group's status.
// Answered and dismissed groups never take in new repeats.
export function addQuestion(text) {
  const id = questions.length + 1;
  const question = { id, at: Date.now(), text, groupId: id, status: "open" };
  const candidates = questions
    .filter((q) => q.id === q.groupId && (q.status === "open" || q.status === "shown"))
    .slice(-MAX_CANDIDATES);
  const match = sameWording(text, candidates);
  if (match) {
    question.groupId = match.groupId;
    question.status = match.status;
  }
  questions.push(question);
  return question;
}

// The shown group first, then the most asked, then the oldest.
export function groups() {
  const byId = new Map();
  for (const q of questions) {
    const group = byId.get(q.groupId);
    if (!group) byId.set(q.groupId, { id: q.groupId, text: q.text, count: 1, status: q.status, at: q.at, variants: [] });
    else {
      group.count++;
      if (q.text !== group.text && !group.variants.includes(q.text)) group.variants.push(q.text);
    }
  }
  const shownFirst = (g) => (g.status === "shown" ? 0 : 1);
  return [...byId.values()].sort((a, b) => shownFirst(a) - shownFirst(b) || b.count - a.count || a.at - b.at);
}

// Showing a group takes any other group off the speaker screen. Returns false if there is no such group.
export function setStatus(groupId, status) {
  if (!questions.some((q) => q.groupId === groupId)) return false;
  for (const q of questions) {
    if (q.groupId === groupId) q.status = status;
    else if (status === "shown" && q.status === "shown") q.status = "open";
  }
  return true;
}

export function shownQuestion() {
  const group = groups().find((g) => g.status === "shown");
  return group ? { text: group.text, count: group.count } : null;
}
