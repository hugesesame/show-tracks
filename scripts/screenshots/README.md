# README screenshots

Retakes `screenshots/main.png`, `memo.png` and `mixer.png` from a sample show, so they can be redone the same way after the screen changes.

- `show.json`: the sample show — three pages, the cues of *Morning Light* with their lyrics, MIDI and the overlap mark.
- `make-media.mjs`: makes the audio and video into `media/` (not kept in the repo). Needs ffmpeg.
- `shoot.mjs`: opens the app in Chrome with the sample show, adds the media, puts the playhead at 0:45 with Verse 2 on standby, and takes the three screenshots. Uses Playwright (the project's, or a global install).

```sh
npm run dev                               # in another terminal
node scripts/screenshots/make-media.mjs   # once
node scripts/screenshots/shoot.mjs        # or pass another URL
```

To change what the screenshots show, edit `show.json` (it is a project, as the app stores it) or the steps in `shoot.mjs`.
