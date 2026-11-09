import { ChevronDown, FlaskConical, Megaphone, PlayCircle, Square, Tags, Users } from "lucide-react";
import { useState } from "react";

export type View = "participant" | "organizer";

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
  note: string;
}) {
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
    <aside aria-label="Demo controls (not part of the product)" className="fixed bottom-4 left-4 z-50 w-[min(340px,calc(100vw-32px))] overflow-hidden rounded-lg border border-[#3a3a3a] bg-[#111111] text-[#e5e5e5] shadow-2xl">
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
      <div className="flex flex-col gap-2 px-3 pb-3">
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
        <span className={`${mono} pt-1 text-[#a3a3a3]`}>sample speaker</span>
        {p.sampleOn ? (
          <button className={btn} onClick={p.onStopSample}><Square size={15} aria-hidden="true" /> stop sample speaker</button>
        ) : (
          <button className={btn} onClick={p.onSample}><PlayCircle size={15} aria-hidden="true" /> play sample talk with voice</button>
        )}
        <span className={`${mono} pt-1 text-[#a3a3a3]`}>annotations</span>
        <button aria-pressed={p.tags} className={`${btn} ${on}`} onClick={() => p.setTags(!p.tags)}>
          <Tags size={15} aria-hidden="true" /> {p.tags ? "hide" : "show"} track tags
        </button>
        {p.note && <p role="status" className={`${mono} text-[#a3a3a3]`}>{p.note}</p>}
      </div>
    </aside>
  );
}
