import { Bot, ChevronDown, FileText, FlaskConical, Megaphone, Mic, MicOff, PlayCircle, RotateCcw, Square, Tags, Users } from "lucide-react";
import { useMicCaptions } from "./useMicCaptions";
import { useState } from "react";

export type View = "participant" | "organizer";

/** One-click questions that show what the AI can and cannot answer from the sample talk. */
const SCENARIOS: [string, string][] = [
  ["When is lunch?", "schedule"],
  ["What do I need to submit?", "rules"],
  ["Where can I find a quiet space?", "access"],
  ["When does the after-party start?", "evening"],
  ["Who won last year?", "not said: no guessing"],
];

/**
 * Demo-only controls, deliberately styled like a developer toolbar so nobody mistakes them for the product.
 * In a real event, organizers and participants would sign in with their role instead of switching views.
 */
export function DemoDock(p: {
  view: View;
  setView: (v: View) => void;
  tags: boolean;
  setTags: (v: boolean) => void;
  sampleOn: boolean;
  onSample: () => void;
  onStopSample: () => void;
  onReset: () => void;
  onLoad: () => void;
  onAsk: (q: string) => void;
  hasLines: boolean;
  roomId: string;
  roomName: string;
  code?: string;
  note: string;
}) {
  const mic = useMicCaptions(p.roomId, p.code, "Judge");
  const [open, setOpen] = useState(true);
  const mono = "font-mono text-[0.78rem]";
  const btn = `${mono} inline-flex min-h-10 items-center gap-2 rounded-md border border-[#3a3a3a] px-3 text-[#e5e5e5] hover:border-[#ffd84d]`;
  const on = "aria-pressed:border-[#ffd84d] aria-pressed:bg-[#ffd84d] aria-pressed:text-[#111111]";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Show demo controls (not part of the product)"
        className={`${mono} fixed bottom-4 left-4 z-50 inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-dashed border-[#ffd84d] bg-[#111111] px-4 font-bold uppercase tracking-[0.12em] text-[#ffd84d] shadow-xl`}
      >
        <FlaskConical size={16} aria-hidden="true" /> Demo
      </button>
    );
  }
  return (
    <aside aria-label="Demo controls (not part of the product)" className="fixed bottom-4 left-4 z-50 flex max-h-[calc(100vh-32px)] w-[min(340px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-[#3a3a3a] bg-[#111111] text-[#e5e5e5] shadow-2xl">
      <div aria-hidden="true" className="h-2" style={{ background: "repeating-linear-gradient(135deg, #ffd84d 0 10px, #111111 10px 20px)" }} />
      <div className="flex items-center justify-between gap-2 px-3 pt-2">
        <span className={`${mono} inline-flex items-center gap-2 font-bold uppercase tracking-[0.12em] text-[#ffd84d]`}>
          <FlaskConical size={15} aria-hidden="true" /> Demo controls
        </span>
        <button onClick={() => setOpen(false)} aria-label="Hide demo controls" className="grid h-9 w-9 place-items-center rounded-md hover:bg-white/10">
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </div>
      <p className={`${mono} px-3 pb-2 text-[#a3a3a3]`}>Not part of the product. In production, people sign in with their role.</p>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-3 pb-3">
        <span className={`${mono} text-[#a3a3a3]`}>view</span>
        <div role="group" aria-label="Demo view" className="grid grid-cols-2 gap-2">
          {(["participant", "organizer"] as View[]).map((v) => {
            const Icon = v === "participant" ? Users : Megaphone;
            return (
              <button key={v} aria-pressed={p.view === v} onClick={() => p.setView(v)} className={`${btn} justify-center ${on}`}>
                <Icon size={15} aria-hidden="true" /> {v}
              </button>
            );
          })}
        </div>
        <span className={`${mono} pt-1 text-[#a3a3a3]`}>try it live</span>
        <button
          aria-pressed={mic.listening}
          disabled={!mic.supported}
          onClick={mic.listening ? mic.stop : mic.start}
          className={`${btn} ${mic.listening ? "border-[#ff8f7c] bg-[#c2331f] text-white" : ""} disabled:opacity-50`}
        >
          {mic.listening ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
          {mic.listening ? "stop the mic" : `speak into the mic (${p.roomName})`}
        </button>
        <p role="status" className={`${mono} text-[#a3a3a3]`}>
          {!mic.supported ? "needs Chrome or Edge" : mic.listening ? `listening · ${mic.sent} lines as "Judge"` : "your words become captions, translated live"}
        </p>
        {mic.error && <p role="alert" className={`${mono} text-[#ff8f7c]`}>{mic.error}</p>}
        <span className={`${mono} pt-1 text-[#a3a3a3]`}>sample speaker</span>
        {p.sampleOn ? (
          <button className={btn} onClick={p.onStopSample}><Square size={15} aria-hidden="true" /> stop sample speaker</button>
        ) : (
          <button className={btn} onClick={p.onSample}><PlayCircle size={15} aria-hidden="true" /> play sample talk with voice</button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button className={btn} onClick={p.onLoad}><FileText size={15} aria-hidden="true" /> load transcript</button>
          <button className={btn} onClick={p.onReset}><RotateCcw size={15} aria-hidden="true" /> reset transcript</button>
        </div>
        <span className={`${mono} pt-1 text-[#a3a3a3]`}>chatbot scenarios {p.hasLines ? "" : "(load the transcript first)"}</span>
        <div className="flex flex-col gap-1">
          {SCENARIOS.map(([q, hint]) => (
            <button key={q} className={`${btn} justify-between text-left`} onClick={() => p.onAsk(q)} title={hint}>
              <span className="inline-flex items-center gap-2"><Bot size={15} aria-hidden="true" /> {q}</span>
              <span className="text-[#a3a3a3]">{hint}</span>
            </button>
          ))}
        </div>
        <span className={`${mono} pt-1 text-[#a3a3a3]`}>annotations</span>
        <button aria-pressed={p.tags} className={`${btn} ${on}`} onClick={() => p.setTags(!p.tags)}>
          <Tags size={15} aria-hidden="true" /> {p.tags ? "hide" : "show"} track tags
        </button>
        {p.note && <p role="status" className={`${mono} text-[#a3a3a3]`}>{p.note}</p>}
      </div>
    </aside>
  );
}
