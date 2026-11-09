# Submission plan

Submission closes at 5:30 PM Mountain Time on Nov 9, 2026. The submission is this repo, so it needs a public repo and a README with setup instructions.

## Where we are

- The app (live captions, speaker pacing, questions for the speaker, hybrid Elasticsearch search, accessibility controls, Spanish) is on the `feature/*` branches. `main` still has only the mockup and README, so merge before submitting.
- Deploy, CI and telemetry are added by the `deploy/k8s-ci-otel` branch: Dockerfile, docker-compose, Kubernetes manifests, a kind config, a CI workflow and `server/telemetry.js`.

## Evidence for each track

Judges look for the tool being central and for proof that it was used. Collect the proof as we go.

| Track | What exists | Still needed |
| --- | --- | --- |
| Elasticsearch | Words and meaning search, lines synced every 2 s | Run it against the hackathon Elasticsearch trial with `OPENAI_API_KEY` set so meaning search is on. Show a search found only by meaning. |
| Dash0 | OpenTelemetry auto-instrumentation, plus `backchannel.lines` and `backchannel.caption.lag` metrics | A Dash0 account and token. Confirm data arrives. Build a dashboard and a caption-lag SLO. Use Agent0 or the MCP server on a real issue. Add frontend monitoring. |
| Radar | Kubernetes manifests that run on kind | Run on the team's Radar cluster, connect Radar, and run an AI investigation on a real fault (for example a crash-looping pod). |
| Sonar (Gitar) | CI workflow | Install Gitar on the repo and ship the remaining features through reviewed PRs. |
| Merge Forward | Text size, high contrast, calm mode, screen reader announcements, Spanish | Test with a keyboard and a screen reader. Write down what was tested. |

## Known limits

- The transcript and the live stream are in one process's memory. The deployment runs one replica with the Recreate strategy. Serving a large audience would need the transcript and stream moved to shared storage. Do not claim scale beyond what was measured.
- Telemetry export has not been checked against a real collector yet.
- Set `PRESENTER_KEY` whenever the app is reachable by anyone else.

## Before submitting

1. Merge the feature branches to `main` and confirm `npm test` passes.
2. The README setup works from a clean clone.
3. The README says which AI coding assistants were used, as the hackathon rules require.
4. The repo is public and contains no keys or personal data.
5. Demo: attendee view with captions, search by meaning, a speaker pacing alert, a question to the speaker, the accessibility controls, then the Dash0 and Radar views.
