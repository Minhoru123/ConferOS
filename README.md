# ConferOS: Backchannel

ConferOS is an AI-powered conference platform. Backchannel is its first piece, a live conference companion built for the Cloud Native Hackathon (Salt Lake City, Nov 9, 2026) by team Ctrl-Alt-Build.

Every room at a conference (the main stage, focus rooms, team rooms) gets a live transcript, a searchable recording, AI summaries, translation, and an AI that answers only from what was actually said.

- Goals: [kb/feature/rmirza/backchannel/goals.md](kb/feature/rmirza/backchannel/goals.md)
- Plan: [kb/feature/rmirza/backchannel/plan.md](kb/feature/rmirza/backchannel/plan.md)
- Clickable design prototype with sample data: [design/prototype.html](design/prototype.html)

## What works today

A walking skeleton, not the finished product.

- API (Fastify, TypeScript): rooms, transcript segments, live updates over server-sent events, and Ask with citations (extractive: returns the best matching line, no LLM yet).
- Web (Vite, React, Tailwind, shadcn-style components): room list, live transcript, Ask. The full design is in the prototype and still to be ported.
- Elasticsearch store for segments (keyword search). Without `ELASTICSEARCH_URL` the API uses an in-memory store.
- Runs as a single API replica. Scaling out needs shared segment numbering and shared live-update fan-out (see `deploy/k8s/api.yaml`).
- OpenTelemetry bootstrap that turns on when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, with custom spans on ingest and Ask.
- Docker images, docker-compose, Kubernetes manifests (kustomize) and a kind config.

Not built yet: speech-to-text capture, translation, summaries, LLM answers, semantic search, rooms with video, auth.

## Setup

Requires Node 22+ and Docker.

```bash
npm install
cp .env.example .env
npm run dev
```

The web app is at http://localhost:5173 and the API at http://localhost:8787. Click "Replay sample" in the web app to stream sample transcript lines into the room.

### With Elasticsearch

```bash
npm run es:up
ELASTICSEARCH_URL=http://localhost:9200 npm run dev -w apps/api
```

### Checks

```bash
npm run typecheck
npm test
npm run build
```

### On Kubernetes with kind

```bash
kind create cluster --name backchannel --config deploy/kind.yaml
docker build -f apps/api/Dockerfile -t backchannel-api:dev .
docker build -f apps/web/Dockerfile -t backchannel-web:dev .
kind load docker-image backchannel-api:dev backchannel-web:dev --name backchannel
kubectl apply -k deploy/k8s
```

The app is then at http://localhost:8081. To send traces to Dash0, create the optional `otel` secret with `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` from your Dash0 account, then restart the api deployment.

## Layout

```
apps/api      Fastify API, store, SSE, telemetry
apps/web      Vite + React frontend
deploy        kind config and Kubernetes manifests
design        Clickable prototype
kb            Goals and plan
```
