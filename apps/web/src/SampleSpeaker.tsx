/** Demo stand-in for the stage stream: an illustrated close-up of the organizer at the podium, with the sample talk's voice and captions. */
export function SampleSpeaker({ speaking, caption, speaker }: { speaking: boolean; caption?: string; speaker?: string }) {
  return (
    <section aria-label="Live stream placeholder" className="relative overflow-hidden rounded-2xl bg-[#0d1422] text-white">
      <svg viewBox="0 0 1280 720" className="block aspect-video w-full" role="img" aria-label="Illustration of the organizer speaking at the podium on the main stage">
        <defs>
          <radialGradient id="spot" cx="50%" cy="20%" r="70%">
            <stop offset="0%" stopColor="#3a4a9a" />
            <stop offset="55%" stopColor="#16204a" />
            <stop offset="100%" stopColor="#080c14" />
          </radialGradient>
          <linearGradient id="suit" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#24304f" />
            <stop offset="100%" stopColor="#141b30" />
          </linearGradient>
          <linearGradient id="podium" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2f3fd6" />
            <stop offset="100%" stopColor="#1b2350" />
          </linearGradient>
        </defs>
        <rect width="1280" height="720" fill="url(#spot)" />
        {/* stage screen behind the speaker */}
        <rect x="140" y="70" width="1000" height="300" rx="18" fill="#0f1830" stroke="#2a3a6a" strokeWidth="4" />
        <text x="640" y="180" textAnchor="middle" fill="#8e9bff" fontFamily="Bricolage Grotesque, sans-serif" fontWeight="700" fontSize="64">Cloud Native Hackathon</text>
        <text x="640" y="245" textAnchor="middle" fill="#ffd84d" fontFamily="JetBrains Mono, monospace" fontSize="30" letterSpacing="6">SALT LAKE CITY · NOV 9</text>
        {/* speaker */}
        <path d="M410 720 C410 560 480 470 640 470 C800 470 870 560 870 720 Z" fill="url(#suit)" />
        <path d="M600 470 L640 560 L680 470 Z" fill="#e8edf6" />
        <path d="M630 500 L640 600 L650 500 Z" fill="#c2331f" />
        <rect x="608" y="400" width="64" height="80" rx="24" fill="#c68a5a" />
        <ellipse cx="640" cy="350" rx="92" ry="108" fill="#d79b6a" />
        <path d="M548 340 C540 250 600 220 646 222 C712 224 742 268 734 338 C722 300 690 284 640 284 C592 284 560 300 548 340 Z" fill="#2b1d14" />
        <ellipse cx="606" cy="360" rx="9" ry="11" fill="#2b1d14" />
        <ellipse cx="674" cy="360" rx="9" ry="11" fill="#2b1d14" />
        <path d={speaking ? "M612 410 Q640 436 668 410 Q640 424 612 410 Z" : "M614 412 Q640 424 666 412"} fill={speaking ? "#7a2e22" : "none"} stroke="#7a2e22" strokeWidth="5" strokeLinecap="round" />
        {/* microphone and podium */}
        <path d="M720 610 L770 470" stroke="#9aa6c0" strokeWidth="8" strokeLinecap="round" />
        <rect x="752" y="432" width="36" height="58" rx="18" fill="#111827" stroke="#9aa6c0" strokeWidth="4" transform="rotate(20 770 461)" />
        <path d="M380 600 L900 600 L930 720 L350 720 Z" fill="url(#podium)" />
        <text x="640" y="680" textAnchor="middle" fill="#ffffff" fontFamily="Bricolage Grotesque, sans-serif" fontWeight="700" fontSize="44">Backchannel</text>
      </svg>
      <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-[#c2331f] px-3 py-1 text-sm font-bold">
        <span className="live-dot" aria-hidden="true" /> Live from Main stage
      </span>
      <span className="font-mono absolute right-3 top-3 rounded-md border-2 border-dashed border-[#ffd84d] bg-[#111111]/85 px-2 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[#ffd84d]">
        Live stream placeholder
      </span>
      {speaking && (
        <span className="font-mono absolute right-3 top-12 rounded-full bg-black/60 px-3 py-1 text-xs uppercase tracking-[0.1em] text-[#c9d4e6]">{speaker ?? "Speaker"} is speaking</span>
      )}
      {caption && (
        <div aria-hidden="true" className="absolute inset-x-3 bottom-3 rounded-xl bg-[#080c14]/90 px-4 py-2 text-[#ffffff]">
          <span className="font-mono block text-[0.7rem] uppercase tracking-[0.12em] text-[#ffd84d]">{speaker}</span>
          <p className="text-[#ffffff]" style={{ fontSize: "calc(1.25rem * var(--scale))", lineHeight: 1.35 }}>{caption}</p>
        </div>
      )}
    </section>
  );
}
