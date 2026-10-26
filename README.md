<h1><img src="icon.svg" width="40" height="40" align="top" alt="">&nbsp;&nbsp;Show Tracks</h1>

**English** | [日本語](README.ja.md)

- Show Tracks is a playback-only web app made for live shows. Each page holds one audio file and one video file. There is no editing: you can only set where a track starts and ends.
- At the markers on the track it can show text: lyrics in time with the music, or text over the video for a karaoke-style video.
- In the same way, it can send a MIDI Note at each marker, to control external gear.
- Pages set the running order. When a song ends, the next page can play on by itself, or start over the end of the song with the overlap mark.
- It sends MTC from the playback time, or follows MTC from a DAW: the DAW plays the sound, and Show Tracks shows the text and sends the MIDI Notes.
- Chrome only. Media and the project are kept in this browser.

> [!IMPORTANT]
> **Desktop Chrome only.** Show Tracks does not work on smartphones or tablets. It relies on a keyboard, a separate output window, and Chrome features such as Web MIDI and the File System Access API.

**Open the app: https://hugesesame.github.io/show-tracks/**

> **This is a beta.** Show Tracks is still being tested and has not been used in a real show yet. MTC and MIDI Notes have been checked with real equipment. Try it with your own equipment before using it in a show.

![Show Tracks: the track with cues, the pages, the Cue List and the video with lyrics over it](screenshots/main.png)

## What it does

- **Pages set the running order.** Each page holds one audio file and one video file. At the end of a page it can stop, open the next page, or play it.
- **Drag and drop**: drop audio or video files on the window. One file goes onto the page open; several make a page each, in order, named after the files. A project file opens as Import does.
- **Cues** are markers on the track. Press **GO** (or `G`) to play from the cue on standby, and step through them in the **Cue List**.
- **In and out points** play only part of a song.
- **Overlap**: a mark near the end of a song starts the next page there, while the end of the song rings out underneath. The video dissolves into the next page's over the same time, from the mark to the song's out point, as in karaoke. During the dissolve two videos play at once on each screen: full HD is fine on most computers, but 4K videos may drop frames.
- **Text on screen at each cue**: lyrics in time with the music, prompts for performers, or text over the video for a karaoke-style picture. Choose the size, color, outline, position and a dissolve between lines.
- **MIDI Note at each cue**, to control lights or other gear. Turn it on or off per cue or for a whole page.
- **MTC** follows the playback time, with an offset per page.
- **Follow a DAW**: PAGES has two lists, Play and MTC In. An MTC In page is a blank track to put cues on; it plays, stops and locates with the MTC from a DAW, sending its memos and MIDI Notes on time while the DAW plays the sound.
- **MIDI remote**: run GO, Play / Stop, Fade out, Duck and Previous / Next cue from a foot switch, pad or desk. Press Learn, then the key.
- **Video output window** for a second display, with the text over the video.
- **Prompter window** with the text alone, for the performers' monitor. Turn the text off on the video output, and the audience sees the video while the performers read the lyrics or prompts. The main screen frames the picture the same way, so what you see is what the audience sees.
- **Mixer** with Audio, Video and Master faders, pan and mute. Move the faders from a MIDI fader box (CC or Pitch Bend / Mackie Control); a fader takes over once it reaches the level on screen, so the sound never jumps.
- **Duck** (`D`): lowers all the sound for an announcement, and brings it back on the next press. How much and how fast are set in Settings.
- **Audio output**: play through an audio interface or any other output device. Unplugged during a show, the sound moves to the system default and comes back when the device is connected again.
- **Show mode** locks editing for the performance, so a stray click cannot move a cue or the playhead.
- **Help** in English and Japanese inside the app: press `?`.

![The Cue List showing memos (lyrics), and the Memo view](screenshots/memo.png)

![The mixer while playing](screenshots/mixer.png)

## Getting started

1. Open the app in desktop Chrome.
2. On the first page, press **Choose** next to Audio (and Video, if there is one) and pick a file. Any format Chrome can play works, such as WAV, MP3, M4A and MP4.
3. Play it with `Space`, and press `M` where you want a cue. Add more pages with **+** in PAGES.
4. For lyrics or prompts, switch the Cue List to **Memo** and double-click a cue to type. `Shift+Enter` starts a new line.
5. Press **Open Video Output** and move the window to the second display. Double-click it or press `F` for fullscreen.
6. For MTC and MIDI Notes, open **Settings** (`⌘,`) and choose the MIDI output.

Press `?` or **Help** at the bottom of PAGES for all the controls and keyboard shortcuts.

### What the browser asks you

The browser asks for permission the first time. Choose **Allow**. If you blocked it by mistake, click the icon at the left of the address bar and change the setting there.

| When | What the browser asks | Why |
|---|---|---|
| The app opens | To control MIDI devices | To send MTC and MIDI Notes, and to listen to the MIDI remote and MTC from a DAW |
| You press **Open Video Output** | To allow pop-ups (only if the window was blocked) | To open the output window |
| You press **Save** the first time | Where to save the file | To write the project file |
| You press **Show Names** next to Audio Output | To use the microphone | Chrome names output devices only then. Nothing is recorded |
| You press **Backup**, **Restore** or **Find Media** | Which folder, and to let the site see (or edit) its files | To write or read the backup and the media |

On a Mac, the **IAC Driver** in Audio MIDI Setup sends MIDI to other apps on the same computer.

## Where your show is kept

- Your show and its audio and video are saved automatically in this computer's browser as you work.
- Nothing is sent anywhere. The show is not on other computers, or in other browsers on the same computer.
- Clearing the browser's site data deletes the show and its media too.
- If the app is open in more than one tab, a yellow warning appears. The tabs overwrite each other's edits, so close all but one.
- **Save** (`⌘S`) writes the project to a file wherever you choose. **The project file does not include audio or video.**
- **Backup** (in **Settings**) writes a folder with the project and all its audio and video. Copy that folder to move a show to another computer, and open it there with **Restore**. Make one before every show.
- **Find Media** (in **Settings**): if you only have the project file, choose a folder with the original audio and video files, and the missing media are found by file name.

## Without an internet connection

- Once the app is open, it keeps working if the connection drops. Playback, MTC, MIDI and the output window do not use the internet.
- The app also keeps a copy of itself in the browser. When **Offline Ready** appears at the bottom right, you can reopen or reload the app on that computer without a connection, including the output window.
- Before taking a computer to a venue with no connection, open the app once where you have a connection and check that **Offline Ready** appears.
- When there is a connection, the app loads the latest version each time it opens.

## Running it on your own computer

This part is for people who want to change the app or build it themselves. You do not need it to use the app — just open the link above. It needs Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Open the address that appears in the terminal (normally http://localhost:5173/).

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server; changes to the code show up right away |
| `npm run build` | Type-check and build the app into a single file, `dist/index.html` |
| `npm run preview` | Open the built app from `dist/` locally |
| `npm test` | Run the tests |

The public site and your local copy keep their saved shows apart. Use **Save** and **Import** to move a show between them.

| Path | Contents |
|---|---|
| `src/app/` | App state and actions |
| `src/engine/` | Playback, the two audio decks, the mixer, MTC and MIDI output |
| `src/cue/` | GO and the cue on standby |
| `src/model/` | Pages, cues, in / out points, overlap and memos |
| `src/media/` | Reading audio and video files, and the waveform |
| `src/ui/` | The main screen: track, pages, Cue List, mixer, memo view, settings, help |
| `src/output/` | The video output window |
| `src/storage/` | Saving in the browser and project files |
| `tests/` | Tests |

Built with TypeScript and Vite, without a UI framework.

## License

[MIT](LICENSE). You are free to use, change and share Show Tracks, including at work. It comes with no warranty.
