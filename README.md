# Hands Free

A web page you control with your hands. Your webcam feeds MediaPipe's hand-gesture
model in the browser, and the gestures drive a three.js scene and a T-Rex runner game.
No video leaves your machine.

## Run it

Requires Node 22+ and a webcam.

```bash
npm install
npm run dev
```

Open http://localhost:5173 and click **Start camera**. The first run downloads the
MediaPipe model (~8 MB) and copies its wasm runtime into `public/` (both gitignored).

## Gestures

### Demo page (`/`)

| Gesture   | Action                 |
| --------- | ---------------------- |
| Open palm | Scroll                 |
| Pinch     | Grab the surface       |
| 2 pinches | Zoom (move hands apart) |
| Victory   | Next section           |
| Fist      | Stop                   |

### T-Rex game (`/#game`)

Open it from the "Play T-Rex with your hands →" link in the control panel.

| Gesture | Action |
| ------- | ------ |
| Pinch   | Jump   |
| Fist    | Duck   |

Birds fly at three heights. Jump the low ones, duck under the middle ones,
and run under the high ones.

Press **D** on either page for the debug panel.

## Keyboard fallbacks (off)

The keyboard does nothing: hands are the only way to scroll the page or play the game.

For development without a camera, copy `.env.example` to `.env.local`, set
`VITE_KEYBOARD_CONTROLS=true` and restart the dev server (the flag is read at build
time). Each page then takes its own keys:

- Demo page (`/`): ↑/↓ move between sections.
- Game (`/#game`): space or ↑ jump, ↓ ducks.

## Scripts

| Command             | What it does              |
| ------------------- | ------------------------- |
| `npm run dev`       | Dev server on port 5173   |
| `npm run build`     | Production build to `dist/` |
| `npm run preview`   | Serve the production build |
| `npm run typecheck` | TypeScript check          |
| `npm test`          | Vitest unit tests         |

## Project layout

```
src/
  App.tsx             demo page (three.js scene + story sections)
  main.tsx            hash routing between the page and #game
  cv/                 MediaPipe recognizer, landmark smoothing, gesture logic
  components/         shared camera layer
  game/               T-Rex runner: physics, obstacles, collision, rendering, hand input
  state/              shared frame/UI store
scripts/
  fetch-assets.mjs    stages the MediaPipe model and wasm into public/
```

## Recording test samples

The pinch/fist thresholds are tested against recorded hand landmarks in
`src/game/fixtures/`. To add real webcam samples: open `/#game`, press **D**, hold a
pose with one hand and press **P** (pinch), **F** (fist) or **O** (other) with the other.
Only the posed hand should be in view, because every visible hand gets the same label.
Press **S** to download, save the file as `src/game/fixtures/webcam-*.json`, and run
`npm test`.

## Credits

T-Rex game rules and tuning are ported from Chromium's offline dino game (BSD license).
The sprites are original.
