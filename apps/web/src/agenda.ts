// Today's Cloud Native Hackathon agenda (Salt Lake City, Mountain Time), from the event's Luma page.
export interface AgendaItem {
  start: string; // HH:MM, Mountain Time
  title: string;
  where: string;
  icon: "coffee" | "megaphone" | "hammer" | "food" | "panel" | "trophy" | "party" | "send";
}

export const AGENDA: AgendaItem[] = [
  { start: "09:00", title: "Check-in and breakfast", where: "Front desk", icon: "coffee" },
  { start: "10:00", title: "Kickoff and partner workshops", where: "Main stage", icon: "megaphone" },
  { start: "11:00", title: "Building starts", where: "Everywhere", icon: "hammer" },
  { start: "13:00", title: "Lunch", where: "Left side of the hall", icon: "food" },
  { start: "14:00", title: "Panel with Kelsey Hightower", where: "Main stage", icon: "panel" },
  { start: "14:30", title: "Back to building", where: "Everywhere", icon: "hammer" },
  { start: "17:30", title: "Submissions close, demos and judging", where: "Main stage", icon: "send" },
  { start: "18:30", title: "Winners announced", where: "Main stage", icon: "trophy" },
  { start: "19:00", title: "After-party at House of Kube", where: "Downtown", icon: "party" },
];
export const SUBMISSION_DEADLINE = "17:30";

const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export const eventMinutes = (d = new Date()) => toMin(fmt.format(d));
export const label = (hhmm: string) => {
  const m = toMin(hhmm);
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export function nowAndNext(minutes: number) {
  let now: AgendaItem | undefined;
  let next: AgendaItem | undefined;
  for (const item of AGENDA) {
    if (toMin(item.start) <= minutes) now = item;
    else {
      next = item;
      break;
    }
  }
  return { now, next };
}

export function countdown(minutes: number, target = SUBMISSION_DEADLINE) {
  const left = toMin(target) - minutes;
  if (left <= 0) return null;
  const h = Math.floor(left / 60);
  return h ? `${h}h ${String(left % 60).padStart(2, "0")}m` : `${left}m`;
}
