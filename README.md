# ConferOS: Backchannel

**Nothing said at a conference gets lost.**

Today's hackathon has around 200 people in one building, a main stage, mentors in side rooms, and teams forming on the spot. Announcements get missed while people code, the room is loud, not everyone hears well or speaks English first, and the person you should meet is three tables away. Backchannel turns every room of an event into a live, searchable, translated transcript with an AI you can ask, plus rooms that help people find each other.

Built by team Ctrl-Alt-Build at the Cloud Native Hackathon (WeMakeDevs, Salt Lake City, November 9, 2026).

Architecture board: https://www.figma.com/board/c9XDkwm2grU3XOgref2hE4/ConferOS

## What you can do

- **Follow any room live.** The main room, focus groups and team zones each have live captions and a transcript that every attendee sees on their own screen.
- **Catch up with the AI.** `@ai summarize what I missed` gives a short recap of the room so far. With a local Llama (Ollama, `OLLAMA_URL` and `OLLAMA_MODEL`) or an OpenAI key, answers and summaries are written by the model from the transcript only; without one, the AI quotes the matching lines.
- **Ask the AI in chat.** Start a chat message with `@ai`, for example `@ai when is lunch?`. It answers only from what was said in that room and shows when it was said. If it was not said, it says so instead of guessing.
- **Read it in your language.** Pick a language and captions and the transcript translate as they arrive, so people whose first language is not English, or who cannot hear the speaker, can follow along.
- **See and hear the stage.** In Organizer view, **Go live** streams the organizer's camera and microphone to every participant in the room (WebRTC), with captions in each viewer's language on top. Each room also has a group call for face-to-face talk.
- **Meet people.** Focus groups are open rooms around a topic. Team zones are private rooms you join with a code, for people with aligned interests to build together.
- **Catch up without stress.** Pause the captions without losing your place, jump back to live, search what was said, or switch to captions only.
- **Know what is next.** A Now and Next strip, today's agenda, and a countdown to the submission deadline, tailored to the Cloud Native Hackathon.
- **Try the signing avatar (experimental).** A 3D avatar signs each caption line. See [Signing avatar](#signing-avatar-experimental) for its limits.
- **Light or dark.** Light by default, dark with one click.
- **Organizer view.** Caption a room from the microphone, type announcements, and go live on camera. Participant view hides all of that.

Accessibility is built in rather than switched on: the layout follows the system's contrast and reduced-motion settings, works with a keyboard and screen readers, keeps touch targets large, and has a small Display menu for text size, contrast and a captions-only layout.

## Try it

You need Docker.

```bash
docker compose --profile app up --build
```

Open http://localhost:8090 in Chrome. The first start takes a minute while Elasticsearch boots.

1. Switch to **Organizer view**, press **Start captions from microphone** under Organizer tools, and talk. Or press **play sample talk with voice** in the demo controls (bottom left).
2. Press **Go live** to stream your camera to the room.
3. Switch to **Participant view** in another window. Captions and the transcript arrive live.
4. Open **Chat** and send `@ai when is lunch?`.
5. Pick **Español** in the language menu.
6. Under **Start or join a room**, create a team zone, copy its join code, and join it from another window.
7. Press **Sign language avatar** under the captions. It can take 30 seconds to load the first time, and it needs internet and this tab on screen. It signs the lines said after that.

## Demo controls

A small dock in the bottom-left corner holds things that exist only for the demo. In production, people sign in with their role and the dock is not there.

- Switch between Participant and Organizer view.
- Play a sample talk read aloud by a neural voice (pre-recorded with Microsoft Edge's online text to speech, voice en-US-AndrewNeural, in `apps/web/public/voice`).
- **Speak into the mic**, so judges can watch their own words become captions that are translated, searchable and answerable by the AI.
- Load or reset the room's transcript.
- Run one-click chatbot scenarios, including a question that was never said, to show the AI does not guess.
- Show or hide the tags that point at the part of the screen each hackathon track powers.

## Hackathon tracks

| Track | How Backchannel uses it today | How it makes Backchannel better next |
| --- | --- | --- |
| Elasticsearch | Stores and searches every room's transcript. The AI chat answers from what Elasticsearch finds. | Hybrid keyword and vector search across every room and day, so "@ai where did someone explain tracing?" finds the right talk. |
| Dash0 | OpenTelemetry spans for line ingest, AI answers and translation, plus metrics for lines added, caption lag and AI questions. | A caption-lag SLO per room, with Agent0 telling organizers when captions fall behind before attendees notice. |
| Sonar (Gitar) | Every change landed through pull requests reviewed by Gitar. We fixed many of its findings; some near the deadline are still open. | Project rules for accessibility and privacy, so reviews catch regressions in captions or contrast. |
| Radar | Kubernetes manifests and a kind config, ready for a Radar-connected cluster. | Radar's AI investigations on the live event cluster, so a crashing captions pod is diagnosed during the talk, not after. |
| Merge Forward | Captions, translation, pause and catch up, captions-only layout, keyboard and screen reader support, and an experimental signing avatar. | Sign output reviewed by Deaf signers, and plain-language summaries for each talk. |

## How it works

```
Organizer (mic captions, camera) --lines--> API (Fastify, TypeScript) --stores and searches--> Elasticsearch
                                                 | live stream (SSE): captions and chat
                                                 v
                     Participants (React, Tailwind, shadcn/ui): captions, transcript, chat with @ai, translation
API --OpenTelemetry--> Dash0              API runs on Kubernetes (kind locally, Radar-connected cluster)
```

```
apps/api      Fastify API: rooms, team zones, transcript lines, chat, AI answers, live stream, telemetry
apps/web      React app: rooms, camera, captions, transcript, chat, translation, organizer tools
deploy        kind config and Kubernetes manifests
kb            Goals and plan
docs          Pitch for the demo
```

## Develop

Requires Node 22+.

```bash
npm install
npm run dev
```

Run `npm install` again after every pull, because dependencies change.

The web app runs at http://localhost:5173 and the API at http://localhost:8787. Without `ELASTICSEARCH_URL` the API keeps lines in memory.

Keys are optional. Copy `.env.example` to `.env` to add them.

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

```bash
OTEL_EXPORTER_OTLP_ENDPOINT='https://ingress.<region>.dash0.com' \
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer ${DASH0_TOKEN},Dash0-Dataset=default" \
OTEL_SERVICE_NAME=backchannel-api \
npm run dev -w apps/api
```

Traces appear under the service `backchannel-api`. Never commit the token.

## Known limits

- The live broadcast uses one WebRTC connection per viewer from the organizer's browser, which suits a room of dozens. A large stage needs a media server (SFU). Group calls use Jitsi Meet in a new tab.
- Translation uses the free MyMemory service, so transcript lines are sent to it, and it has a daily quota.
- Microphone captions need Chrome or Edge. Captions and the camera need localhost or HTTPS.
- Live updates and chat are fanned out inside one API process, so the API runs as one replica. A large event needs shared fan-out such as Redis pub/sub.
- The AI answers with the best matching line from the transcript. With `OPENAI_API_KEY` set, it writes a short answer from the retrieved lines instead. Summaries are next.

## Signing avatar (experimental)

Press **Sign language avatar** on the caption stage and each transcript line is also signed in the browser. The API only translates while someone has the avatar on.

- A language model picks which signs to use from a fixed vocabulary of 833 signs and cannot invent movements. It uses Claude when `ANTHROPIC_API_KEY` is set, otherwise OpenAI when `OPENAI_API_KEY` is set. With neither, the avatar signs word by word.
- **This is not American Sign Language.** The vocabulary mixes signs from several sign languages (ISL, BSL, Auslan), and no signers have reviewed the output. It is a technical experiment and does not replace an interpreter.
- Credits: the sign vocabulary comes from Avatar-Generator-FYP (MIT). The avatar is CWASA from the University of East Anglia (CC BY-NC-ND), loaded unmodified from its own server.
- Prior work: the translator, lexicon loader and avatar player were adapted from TalkLens, a project written before this hackathon.

## AI assistance

As the hackathon rules ask, we disclose that this project was built with help from AI coding assistants. Claude Code helped plan the project and write code and documentation, and Gitar reviewed every pull request. The team reviewed and tested the changes.
