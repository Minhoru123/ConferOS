# Goals: Backchannel, a live conference companion

**Team:** Ctrl-Alt-Build
**LEAP level:** 1 (proof of concept, 70%+ coverage target)
**Event:** Cloud Native Hackathon, Mon Nov 9, 2026, Salt Lake City
**Deadline:** submission 5:30 PM MT

## Problem

At a conference, what happens on stage is gone the moment you look away. Organizer announcements get missed, in a large crowd it is hard for anyone to keep up and it can feel overwhelming (noisy rooms, a different first language, difficulty hearing or focusing on live speech, or being pulled away mid-talk), and there's no easy place to find the people and projects you care about.

## Vision

Everything said on stage becomes a live, searchable transcript. You can ask questions about what's been said so far, read it in your language, and join rooms with people who share your interests, all from a phone or laptop.

## Users (design for these first)

1. **Heads-down builder (a hackathon participant):** wants to work and still catch announcements.
2. **Attendee who finds it hard to keep up with a large event:** for any reason (access needs, noise, attention, fatigue, feeling overwhelmed). Needs reliable, readable live captions, a way to catch up, and a calm interface. Designing for this person helps everyone, so it is a design principle, not a niche case.
3. **Screen-reader user:** needs a fully keyboard-navigable UI with sane live-region announcements.
4. **Non-native English speaker:** needs translation and plain-language summaries.
5. **Organizer:** needs to broadcast announcements and run rooms with minimal setup.
6. **First-time attendee:** needs "where do I go, who do I talk to."

## Goals

| # | Goal | Priority |
|---|------|----------|
| G1 | Live transcript of the stage, with speech-to-screen latency p95 under 5 s | P0 |
| G2 | Search the transcript (keyword and semantic) | P0 |
| G3 | "Ask" an AI about what's been said so far, with timestamped citations | P0 |
| G4 | WCAG 2.2 AA accessibility: keyboard, screen reader, contrast, text size, reduced motion | P0 |
| G5 | Deployed on Kubernetes with Radar connected | P0 |
| G6 | Traces, logs, metrics and frontend monitoring in Dash0, with a latency SLO | P0 |
| G7 | Translation of the transcript into selectable languages | P1 |
| G8 | Organizer-created rooms (zones) with chat | P1 |
| G9 | Teams can start public or private rooms (join code) so more people can stop by | P2 |
| G11 | Optional video in the main channel, organizer focus rooms and team rooms, with live captions on every stream | P2 |
| G10 | Plain-language summary of each session | P2 |

## Track strategy

- **Elasticsearch:** transcript and chat storage, hybrid search, and retrieval for Ask.
- **Dash0:** end-to-end tracing of the audio-to-screen pipeline, with the latency SLO as the dashboard.
- **Radar:** the app runs on Kubernetes, and we use its AI investigation on a real fault.
- **Sonar (Gitar):** all work goes through PRs that Gitar reviews.
- **Merge Forward:** accessibility is the product, not an add-on.
- **Best overall:** a real problem, a live demo, and a clear architecture.

## Scale

Stateless API pods behind a service, autoscaling on Kubernetes, an Elasticsearch index per event, and fan-out to many viewers over server-sent events. We'll show a load test (for example, 1,000 simulated viewers) in Dash0. Targets beyond what we test are claims, so the demo should show only what we measured.

## Non-goals

Building our own video infrastructure (use an embed or a hosted video SDK), speaker identification, native mobile apps, user accounts beyond a display name.

## Purpose check

Every feature must pass this test: does it make conferences better for attendees, especially those who find it hard to keep up? Video (G11) is allowed only as optional, captioned, and built on a hosted service. It is the first thing cut if we are behind at 15:30.

## Success criteria

- A judge can open the app on a phone, see live captions, ask a question and get a cited answer.
- The accessibility checklist passes with a screen reader and keyboard only.
- Submission is in by 5:15 PM with a public repo, a README and an AI-usage disclosure.

## Risks and ethics

- Venue Wi-Fi and speech-to-text latency. Mitigation: a recorded-talk fallback through the same pipeline.
- Transcript accuracy. Label it as "auto-generated" in the UI.
- Moderation of rooms. Mitigation: a code of conduct link and an organizer mute and remove control.
- Only organizer-approved mics are transcribed, and no personal data goes into the repo or demo.

## Hackathon rules to honor

- Main coding begins after kickoff.
- Public repo with a README that has setup instructions.
- Disclose AI coding assistant use.
- Team members must be able to explain the architecture and decisions.
