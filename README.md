# ConferOS
ConferOS would be an AI-powered conference platform that autonomously plans, personalizes, and adapts your conference experience in real time.

## Live captions and signing

A speaker's microphone goes to Deepgram, captions reach every connected page over a WebSocket, and an experimental avatar signs along.

```
microphone -> server -> Deepgram -> caption lines -> every viewer
                                         |
                                         v
                       short pieces -> Claude picks glosses -> sign lexicon -> avatar (CWASA)
```

### Run it

You need Node.js 22 or later, a [Deepgram](https://deepgram.com) key and an [Anthropic](https://platform.claude.com) key.

```bash
npm install
cp .env.example .env
npm run dev
```

Fill in `.env`, then open <http://localhost:3000/live.html> in Chrome, press **Start microphone** and turn on **Sign language avatar**. Browsers only allow the microphone on `localhost` or HTTPS. Without an Anthropic key the avatar goes word by word.

`npm test` needs no keys: it replaces Deepgram and the model with local fakes.

### Connecting a front end

Include `public/live-client.js`, and optionally `public/sign-avatar.js`, then:

```js
const live = ConferLive.connect({
  onHistory: (lines) => {},  // finished lines said before this page connected
  onCaption: (line) => {},   // { id, t, who, text, final }: the same id updates until final is true
  onSigns: (item) => {},     // { tokens: [{ word, hasSign }], sigml, byModel }
});
live.setSigns(true);         // nothing is translated while no page has this on

const microphone = await ConferLive.startMicrophone({ key: "", onStop: (reason) => {} });
microphone.stop();
```

### Signing avatar (experimental)

A demo, not an interpreter. Captions remain the reliable way to follow a talk.

- The model only chooses and orders signs. Movements always come from the lexicon, so it cannot invent one. Words without a sign are shown crossed out.
- The vocabulary is **not American Sign Language**. Its source describes it as Indian Sign Language, and some file names point to British and Australian signs, so treat the language as mixed or unconfirmed.
- Nobody who signs has reviewed the output.

## Prior work

The live captions and signing code in this repository was written during the hackathon, **except as stated here**:

- The signing design and these files are adapted to TypeScript from TalkLens, an earlier project by the same author, written before this hackathon: `src/signs/translator.ts`, `src/signs/lexicon.ts`, `src/signs/liveSigner.ts` and `public/sign-avatar.js`.

## Third-party work

- `data/signs/lexicon.sigml`: 833 signs in HamNoSys from [Avatar-Generator-FYP](https://github.com/SaiSriSatvic2005/Avatar-Generator-FYP-), MIT licence, included in the file.
- [CWASA](https://vh.cmp.uea.ac.uk/index.php/CWASA_Conditions_of_Use) plays the signs. It loads unmodified from the University of East Anglia when someone turns the avatar on, so it needs internet. Its licence (CC BY-NC-ND) does not allow commercial use without talking to them.
- Deepgram transcribes speech and Claude chooses the glosses.

This project was built with AI assistance (Claude Code).
