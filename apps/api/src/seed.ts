import type { Room } from "./types.js";

const at = "2026-11-09T16:00:00.000Z";
const room = (id: string, kind: Room["kind"], name: string, desc: string, video = true): Room => ({ id, kind, name, desc, video, audio: true, priv: false, createdAt: at });

export const SEED_ROOMS: Room[] = [
  room("main", "stage", "Main stage", "Kickoff, talks, the Kelsey Hightower panel and demos"),
  room("observability", "focus", "Dash0 table", "Traces, logs and dashboards with the Dash0 team"),
  room("search", "focus", "Elasticsearch table", "Keyword, vector and hybrid search help"),
  room("kubernetes-101", "focus", "Radar workshop", "Shipping and debugging on Kubernetes with Radar"),
  room("code-review", "focus", "Gitar code review", "Never merge broken: reviews and CI help"),
  room("accessibility", "focus", "Merge Forward", "Making conferences work for everyone"),
  room("ctrl-alt-build", "team", "Ctrl-Alt-Build", "Open team zone: drop by and see what we are building"),
];

/** Sample lines used by the dev replay endpoint, so demos work without a live microphone. */
export const SAMPLE_LINES: Record<string, { speaker: string; text: string }[]> = {
  main: [
    { speaker: "Organizer", text: "Good morning, everyone. Welcome to the Cloud Native Hackathon. Check-in is open at the back if you haven't picked up your badge." },
    { speaker: "Organizer", text: "Building starts at eleven. Teams can still form at the front until then." },
    { speaker: "Organizer", text: "Lunch will be at one o'clock. Vegetarian and gluten-free options are on the left side of the room." },
    { speaker: "Organizer", text: "At two there is a panel with Kelsey Hightower. After that we go back to building." },
    { speaker: "Organizer", text: "Project submissions close at five thirty. You need a public repository and a README with setup instructions." },
    { speaker: "Organizer", text: "Demos run from five thirty. Winners are announced at six thirty, and the after-party starts at seven." },
    { speaker: "Organizer", text: "If you need a quiet space, the room at the back left is set aside for that. Ask any organizer." },
  ],
  observability: [
    { speaker: "Mentor", text: "A trace is the path one request takes through your services. Each step is called a span." },
    { speaker: "Mentor", text: "If a trace stops at the gateway, check that the trace context header is forwarded to the next service." },
    { speaker: "Mentor", text: "Start with one latency measure for the whole flow, then add detail where it hurts." },
  ],
};
