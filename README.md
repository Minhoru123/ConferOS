# ConferOS: Backchannel

Live captions for every talk, so nothing said on stage gets lost.

At a big event it is hard for anyone to keep up. Announcements get missed, rooms are noisy, some people find live speech hard to follow, and once something is said it is gone. Backchannel turns what is said on stage into a live, searchable transcript that anyone can follow on their own screen, at their own pace, and ask questions about.

Built by team Ctrl-Alt-Build at the Cloud Native Hackathon (WeMakeDevs, Salt Lake City, November 9, 2026).

Architecture board: https://www.figma.com/board/c9XDkwm2grU3XOgref2hE4/ConferOS

## Try it

You need Docker.

```bash
docker compose --profile app up --build
```

Open http://localhost:8090. The first start takes a minute while Elasticsearch boots.

1. Open **Presenter tools** under the transcript and press **Start captions from microphone** (Chrome or Edge, allow the microphone). Talk, and each phrase appears as a caption and a transcript line for every viewer. No microphone? Type a line, or press **Replay sample talk**.
2. Search the transcript, or ask a question such as "When is lunch?" under **Ask about this room**. The answer comes only from what was said, with the time it was said.
3. Try the reading controls: text size, **High contrast**, **Calm mode**, **Pause** (with a count of missed lines and a jump back to live) and **Read new lines aloud** for screen readers.

## What it does

- **Live captions from the microphone** using the browser's speech recognition. A typed-line fallback and a sample talk for demos.
- **Live transcript** pushed to every viewer over server-sent events, per room (main stage, focus rooms, team rooms).
- **Search** across what was said, stored in Elasticsearch.
- **Ask with citations.** Answers are taken only from the transcript and link back to the line. If something was not said, it says so instead of guessing.
- **Built for when it is too much.** Text size, high contrast, calm mode (one column, only the latest lines, larger text), pause and catch up, screen reader announcements that are off unless you turn them on, keyboard friendly controls with a skip link and large touch targets.
- **Presenter key.** Set `PRESENTER_KEY` and only the presenter can add lines. Reading, searching and asking stay open.

## Hackathon tracks

| Track | How Backchannel uses it |
| --- | --- |
| Elasticsearch | The transcript store and search for every room. Ask retrieves the lines it answers from. |
| Dash0 | OpenTelemetry traces for every request, custom spans for line ingest and Ask, and a `backchannel.caption.lag` metric for how long final captions take. |
| Merge Forward | Accessibility is the product: captions, calm mode, contrast, text size, pause and catch up, screen reader control. |
| Sonar (Gitar) | Every change landed through pull requests reviewed by Gitar. Its findings on #2 and #3 (a sequence race, stop words in search, room-switch races, startup ordering) were fixed in #3. |
| Radar | Kubernetes manifests and a kind config are included, ready to run on a Radar-connected cluster. |

## How it works

```
Presenter page (mic or typed) --POST lines--> API (Fastify, TypeScript) --stores and searches--> Elasticsearch
                                                    |  live stream (SSE)
                                                    v
                                     Attendee app (React, Tailwind, shadcn/ui)
API --OpenTelemetry--> Dash0          API runs on Kubernetes (kind locally, Radar-connected cluster)
```

```
apps/api      Fastify API: rooms, lines, live stream, Ask, presenter key, telemetry
apps/web      React app: captions, transcript, search, Ask, reading controls, presenter tools
deploy        kind config and Kubernetes manifests
design        Clickable design prototype
kb            Goals and plan
```

## Develop

Requires Node 22+.

```bash
npm install
npm run dev
```

The web app runs at http://localhost:5173 and the API at http://localhost:8787. Without `ELASTICSEARCH_URL` the API keeps lines in memory. To use Elasticsearch locally:

```bash
npm run es:up
ELASTICSEARCH_URL=http://localhost:9200 npm run dev -w apps/api
```

Checks:

```bash
npm run typecheck
npm test
npm run build
```

## Deploy on Kubernetes

```bash
kind create cluster --name conferos --config deploy/kind.yaml
docker build -f apps/api/Dockerfile -t backchannel-api:dev .
docker build -f apps/web/Dockerfile -t backchannel-web:dev .
kind load docker-image backchannel-api:dev backchannel-web:dev --name conferos
kubectl apply -k deploy/k8s
```

The app is then at http://localhost:8081. Optional Secrets, then `kubectl rollout restart deploy/api`:

```bash
kubectl create secret generic presenter --from-literal=PRESENTER_KEY=choose-a-key
kubectl create secret generic otel \
  --from-literal=OTEL_EXPORTER_OTLP_ENDPOINT='https://ingress.<region>.dash0.com' \
  --from-literal=OTEL_EXPORTER_OTLP_HEADERS='Authorization=Bearer <token>,Dash0-Dataset=default'
```

## Send telemetry to Dash0

Set the standard OpenTelemetry variables with the OTLP HTTP endpoint and an ingest token from your Dash0 account, then start the API:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT='https://ingress.<region>.dash0.com' \
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer ${DASH0_TOKEN},Dash0-Dataset=default" \
OTEL_SERVICE_NAME=backchannel-api \
npm run dev -w apps/api
```

Traces show up under the service `backchannel-api`. Never commit the token.

## Known limits

- Live updates are fanned out inside one API process, so the API runs as one replica. Serving many rooms at a large event needs shared fan-out (for example Redis pub/sub).
- Microphone captions need Chrome or Edge on localhost or HTTPS, and the audio goes to the browser's speech service.
- `backchannel.caption.lag` is measured in the presenter's browser from the last partial caption to the final text. It is not the full time to every viewer's screen.
- Ask returns the best matching line. Generated answers, translation, summaries and video rooms are planned, not built.

## AI assistance

As the hackathon rules ask, we disclose that this project was built with help from AI coding assistants. Claude Code helped plan the project and write code and documentation, and Gitar reviewed every pull request. The team reviewed and tested the changes.
