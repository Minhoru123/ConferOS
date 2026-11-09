# Plan: Backchannel

Goals: [goals.md](goals.md)

## Architecture

The capture page streams mic audio over a WebSocket to the API. The API sends chunks to speech-to-text, writes each segment (text, time, language, embedding) to Elasticsearch, and broadcasts it to viewers over SSE. Ask runs hybrid retrieval over the segments so far and sends the top passages to the LLM. Translation is on demand and cached. Rooms and chat use WebSockets and are stored in Elasticsearch. The frontend is React (TypeScript throughout). OpenTelemetry instrumentation covers every hop, and the app runs on kind with Radar attached.

## Workstreams

Mixed full-stack team: each person owns one workstream, and everyone reviews PRs.

- **A. Pipeline:** capture page, speech-to-text, indexing, SSE fan-out.
- **B. Experience and accessibility:** attendee UI, captions view, settings, a11y testing.
- **C. AI and search:** hybrid search, Ask with citations, translation, summaries.
- **D. Platform:** repo, CI, Gitar, Docker, Kubernetes, Radar, OpenTelemetry and Dash0.

Owners: _to be assigned by the team._

## Timeline (Mountain Time)

| Window | Milestone |
|--------|-----------|
| 11:30-12:30 | Repo public, Gitar and Dash0 accounts, Elasticsearch (Elastic Cloud trial or Docker), kind cluster, skeleton app, first PR reviewed by Gitar |
| 12:30-14:30 | **Vertical slice:** mic to transcript on screen to indexed. Deployed on kind. A trace visible in Dash0 |
| 14:30-15:30 | Search and Ask with citations. Accessibility pass 1 with keyboard and a screen reader |
| 15:30-16:15 | P1: translation, then rooms and chat, as time allows. Dash0 SLO and dashboard. Induce a fault and run a Radar AI investigation |
| 16:15 | **Feature freeze** |
| 16:15-17:00 | Hallway test with 2-3 attendees, fix the top issues, README with setup and AI-usage disclosure, record a fallback demo |
| 17:00-17:15 | **Submit** (deadline 5:30 PM) |
| 17:30 | Demo |

**Cut line:** if behind at 15:30, drop P2 and keep P0 and as much P1 as works.

## Demo script (about 3 minutes)

1. The problem, in 20 seconds.
2. Live captions on a phone while someone speaks.
3. Search and an Ask question with a citation.
4. A screen-reader and keyboard run-through, then switching language.
5. A rooms glimpse.
6. Dash0 trace and SLO, and Radar investigating a fault.
7. Show a Gitar-reviewed PR.

## Testing (Level 1, 70%+ target)

- Unit tests for the segment indexer, retrieval and citation formatting.
- An integration test for audio chunk to indexed segment.
- Automated accessibility checks (axe) plus manual screen-reader and keyboard runs.
- A load test for fan-out.

## Open items

- The exact Gitar configuration for project conventions.
- Which speech-to-text and embedding models to use. We have OpenAI credits, but what they cover is unchecked.
- Whether Elastic Cloud trial or local Docker is quicker. Local Docker avoids sign-up friction but needs more resources on the cluster.
