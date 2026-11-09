# ConferOS
ConferOS would be an AI-powered conference platform that autonomously plans, personalizes, and adapts your conference experience in real time.

## Backchannel

Backchannel is the first piece: live captions for a talk that anyone can follow on their own screen, with larger text, high contrast, a calm mode, screen reader announcements and Spanish, plus search and answers drawn only from what was said. Built at the Cloud Native Hackathon (WeMakeDevs, Salt Lake City, November 9, 2026).

`Backchannel.html` is the original design mockup. The app serves its frontend from `public/`.

### Run it

You need Node.js 22.9 or later.

```bash
npm install
npm start
```

- Attendees: http://localhost:3000
- Presenter (microphone or typed lines, restart the demo): http://localhost:3000/presenter.html

On start, the server replays a short scripted kickoff so there is something to follow without a microphone. The microphone needs Edge or Chrome, and the page must be on localhost or HTTPS.

### Settings

Put these in the environment or in a `.env` file.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `PRESENTER_KEY` | empty (no key) | Key the presenter page must send to add lines or restart the demo. Set it whenever the app is reachable by others. |
| `REPLAY` | `on` | `off` turns off the scripted kickoff |
| `REPLAY_INTERVAL_MS` | `6000` | Time between replayed lines |
| `EVENT_TZ` | `America/Denver` | Time zone for the time shown next to each line |

### API

| Method and path | What it does |
| --- | --- |
| `GET /api/stream` | Server-Sent Events. `snapshot` carries the whole transcript on connect and after a restart; `line` carries each new line. |
| `POST /api/lines` | `{ "text": "...", "who": "Speaker" }` adds a line. Needs the `x-presenter-key` header when a key is set. |
| `POST /api/replay` | Clears the transcript and restarts the scripted kickoff. Needs the presenter key when one is set. |

## Credits and AI disclosure

- Several features follow TalkLens (https://github.com/luisgard/talklens, MIT), which a teammate built at this hackathon.
- We used AI coding assistants (Claude Code) while building this project, as the hackathon rules ask us to disclose.
