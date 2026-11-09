import { Mic } from "lucide-react";

/** Demo stand-in for a live speaker: a browser voice reads the sample talk aloud while captions follow it. */
export function SampleSpeaker({ speaking, caption, speaker }: { speaking: boolean; caption?: string; speaker?: string }) {
  return (
    <section aria-label="Sample speaker" className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1b2350] to-[#0d1422] text-white">
      <div className="flex aspect-video flex-col items-center justify-center gap-4">
        <span className="relative grid h-28 w-28 place-items-center">
          {speaking && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-[#8e9bff]/40" />}
          <span className={`relative grid h-28 w-28 place-items-center rounded-full border-4 ${speaking ? "border-[#ffd84d]" : "border-white/20"} bg-[#2f3fd6]`}>
            <Mic size={44} aria-hidden="true" />
          </span>
        </span>
        <p className="font-mono text-sm uppercase tracking-[0.12em] text-[#c9d4e6]">{speaking ? `${speaker ?? "Speaker"} is speaking` : "Sample speaker"}</p>
      </div>
      <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-[#c2331f] px-3 py-1 text-sm font-bold">
        <span className="live-dot" aria-hidden="true" /> Live from Main stage
      </span>
      {caption && (
        <div aria-hidden="true" className="absolute inset-x-3 bottom-3 rounded-xl bg-[#080c14]/85 px-4 py-2">
          <span className="font-mono block text-[0.7rem] uppercase tracking-[0.12em] text-[#ffd84d]">{speaker}</span>
          <p style={{ fontSize: "calc(1.25rem * var(--scale))", lineHeight: 1.35 }}>{caption}</p>
        </div>
      )}
    </section>
  );
}
