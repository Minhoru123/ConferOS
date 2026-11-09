import { createContext, useContext } from "react";

/** Demo annotations that point at the part of the screen each hackathon track powers. Hidden from screen readers. */
export const TagsContext = createContext(false);

type Side = "top" | "bottom";
export function TrackTag({ track, label, side = "top", className = "" }: { track: string; label: string; side?: Side; className?: string }) {
  const on = useContext(TagsContext);
  if (!on) return null;
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute z-40 flex ${side === "top" ? "flex-col" : "flex-col-reverse"} items-start ${className}`}>
      <span className="font-mono whitespace-nowrap rounded-md border-2 border-[#ffd84d] bg-[#111111] px-2 py-1 text-[0.7rem] leading-tight text-white shadow-lg">
        <b className="uppercase tracking-[0.1em] text-[#ffd84d]">{track}</b> · {label}
      </span>
      <span className={`ml-4 h-0 w-0 border-x-[7px] border-x-transparent ${side === "top" ? "border-t-[8px] border-t-[#ffd84d]" : "border-b-[8px] border-b-[#ffd84d]"}`} />
    </span>
  );
}
