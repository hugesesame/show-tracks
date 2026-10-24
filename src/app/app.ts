import { go, initialCueState, passed, reconcile, select, type CueState } from '../cue/cueController';
import { History } from './history';
import { AudioOutput } from '../engine/audioOutput';
import { MidiPresses, remoteAction } from '../engine/midiRemote';
import { MtcOutput } from '../engine/mtc';
import { MtcInput, type MtcInputState } from '../engine/mtcInput';
import type { Fps } from '../engine/timecode';
import { Transport } from '../engine/transport';
import { importMediaFile } from '../media/importMedia';
import { moveClip } from '../model/clips';
import {
  addMarker,
  cueAt,
  cuesPassed,
  memoAt,
  removeMarker,
  renameMarker,
  setMarkerFields,
  setMarkerTime,
  type MarkerFields,
} from '../model/markers';
import { cuesReached, noteFor } from '../model/notes';
import { activeOverlap, setOverlap, setRangeEnd, setRangeStart, type PlayRange } from '../model/range';
import {
  addPage,
  createPage,
  createProject,
  currentPage,
  followsMtc,
  keepLive,
  movePage,
  nextPage,
  removePage,
  renamePage,
  replacePage,
  setCurrentPage,
  updatePage,
  updateSettings,
} from '../model/project';
import type { EndAction, MediaRecord, MidiTrigger, Page, Project, RemoteAction, Settings } from '../model/types';
import { OutputWindow } from '../output/outputWindow';
import {
  createAutosaver,
  deleteMedia,
  exportProjectJson,
  getMedia,
  importProjectJson,
  listMediaIds,
  pagesWithMissingMedia,
  putMedia,
  saveProject,
  stashUnsaved,
  type Autosaver,
} from '../storage/db';

const SKIP_SECONDS = 5;
const SHOW_MODE_KEY = 'cue-player-show-mode';

/** Show mode survives a reload in the middle of a show. */
function loadShowMode(): boolean {
  try {
    return localStorage.getItem(SHOW_MODE_KEY) === 'on';
  } catch {
    return false;
  }
}
/** Markers this close to the playhead count as "here" for prev/next jumps. */
const MARKER_EPSILON = 0.05;
/** Following MTC, the playhead is corrected once it is this far off (about a frame). */
const FOLLOW_DRIFT = 0.04;

export class App {
  readonly transport: Transport;
  readonly mtc: MtcOutput;
  readonly output: OutputWindow;
  /** The memos alone, for the performers' monitor. */
  readonly prompter: OutputWindow;
  readonly audioOutput: AudioOutput;
  /** MTC coming in from a DAW, for pages that follow it. */
  readonly mtcIn = new MtcInput();
  /** What the incoming MTC said at the last check, to act only when it changes. */
  private mtcFollowed: { state: MtcInputState; seconds: number } | null = null;
  private _project: Project;
  private _cue: CueState;
  private readonly media = new Map<string, MediaRecord>();
  private storedMediaIds = new Set<string>();
  private loadedPageId: string | null = null;
  private loading: Promise<void> = Promise.resolve();
  private readonly autosaver: Autosaver;
  /** The page time cue notes were last checked at while playing; null after a start or jump. */
  private noteTime: number | null = null;
  private readonly events = new EventTarget();
  /** Earlier projects, for Undo; an edit records the project as it was before. */
  private readonly history = new History<Project>();
  /** Set while an edit is under way, so its commit clears the steps Redo could bring back. */
  private editing = false;
  private _showMode = loadShowMode();
  private readonly presses = new MidiPresses();
  /** A remote control waiting for its note or CC, while Learn is on. */
  private learning: { action: RemoteAction; done: () => void } | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;
  private fadeEnd = 0;

  constructor(
    private readonly db: IDBDatabase,
    project: Project,
    monitor: HTMLVideoElement,
  ) {
    this._project = project;
    this._cue = initialCueState(project, project.currentPageId);
    this.transport = new Transport(monitor);
    this.mtc = new MtcOutput(() => ({ time: this.transport.now(), playing: this.transport.playing }));
    this.output = new OutputWindow(this.transport);
    this.prompter = new OutputWindow(this.transport, 'prompter');
    this.audioOutput = new AudioOutput(this.transport.mixer, (message) => this.error(message));
    this.audioOutput.onChange(() => this.emit('change'));
    this.autosaver = createAutosaver(
      (p) => saveProject(db, p),
      () => this.error('Saving failed. Storage may be full.'),
    );
    this.transport.on('locate', () => {
      this.mtc.locate(this.transport.now());
      this.noteTime = null;
    });
    this.mtc.onTick(() => {
      this.followIncomingMtc();
      this.followPlayback();
    });
    this.transport.on('playstate', () => {
      if (!this.transport.playing) this.mtc.locate(this.transport.now());
      this.emit('change');
    });
    this.transport.on('load', () => this.emit('change'));
    this.transport.on('ended', () => void this.handlePageEnd());
    this.transport.on('overlap', () => void this.handleOverlap());
    window.addEventListener('pagehide', () => {
      const unsaved = this.autosaver.pending();
      if (unsaved) stashUnsaved(unsaved);
    });
  }

  async start(): Promise<void> {
    this.storedMediaIds = await listMediaIds(this.db);
    // Media kept for Undo in an earlier session is no longer needed.
    void this.deleteUnusedMedia([...this.storedMediaIds]);
    this.applyPageSettings();
    await this.loadCurrentPage();
    await this.audioOutput.init();
    await this.mtc.init();
    this.listenToRemote();
    this.listenToMtc();
    this.mtc.selectOutput(this._project.settings.midiOutputId);
  }

  // ---- state ----

  get project(): Project {
    return this._project;
  }

  get cue(): CueState {
    return this._cue;
  }

  get page(): Page {
    return currentPage(this._project);
  }

  get duration(): number {
    return this.loadedPageId === this.page.id ? this.transport.duration : 0;
  }

  /** The part of the current page that plays. */
  get range(): PlayRange {
    return this.loadedPageId === this.page.id ? this.transport.range : { start: 0, end: 0 };
  }

  mediaFor(id: string | null): MediaRecord | null {
    return id ? (this.media.get(id) ?? null) : null;
  }

  missingMediaPageIds(): string[] {
    return pagesWithMissingMedia(this._project, this.storedMediaIds);
  }

  onChange(listener: () => void): void {
    this.events.addEventListener('change', listener);
  }

  onError(listener: (message: string) => void): void {
    this.events.addEventListener('error', (e) => listener((e as CustomEvent<string>).detail));
  }

  private emit(type: 'change'): void {
    this.events.dispatchEvent(new Event(type));
  }

  error(message: string): void {
    this.events.dispatchEvent(new CustomEvent('error', { detail: message }));
  }

  private commit(project: Project, previousMarkers = this.page.markers): void {
    if (this.editing && project !== this._project) this.history.clearRedo();
    const pageChanged = project.currentPageId !== this._project.currentPageId;
    this._project = project;
    this._cue = reconcile(project, this._cue, previousMarkers);
    this.autosaver.schedule(project);
    this.applyPageSettings();
    if (pageChanged && this.loadedPageId !== project.currentPageId) {
      this.transport.pause();
      void this.loadCurrentPage();
    } else void this.preloadNext();
    this.emit('change');
  }

  private updateCurrentPage(update: (page: Page, duration: number) => Page): void {
    const page = this.page;
    this.commit(replacePage(this._project, update(page, this.duration)), page.markers);
  }

  private applyPageSettings(): void {
    const page = this.page;
    if (this.loadedPageId === page.id) {
      this.transport.setBlankLength(page.blankLength);
      this.transport.setOffsets(page.audioOffset, page.videoOffset);
    }
    this.transport.setRange(page.rangeStart, page.rangeEnd);
    // A page following a DAW hands over to the next page only by hand.
    const hasNext = nextPage(this._project, page.id) !== null && !this.following;
    this.transport.setOverlap(hasNext ? activeOverlap(page, this.duration) : null);
    const { mixer } = this.transport;
    const { masterVolume, masterMuted, masterPan } = this._project.settings;
    mixer.setLevel(this.transport.channel('audio'), page.audioVolume, page.audioMuted, page.audioPan);
    mixer.setLevel('video', page.videoAudioVolume, !page.videoAudioEnabled, page.videoPan);
    mixer.setLevel('master', masterVolume, masterMuted, masterPan);
    this.mtc.configure(this._project.settings.mtcFps, page.mtcOffset, !this.following);
  }

  private async loadCurrentPage(): Promise<void> {
    const load = async () => {
      const page = this.page;
      const [audio, video] = await Promise.all([this.fetchMedia(page.audioMediaId), this.fetchMedia(page.videoMediaId)]);
      this.transport.setBlankLength(page.blankLength);
      try {
        await this.transport.load(audio?.blob ?? null, video?.blob ?? null, page.audioOffset, page.videoOffset);
      } catch {
        this.error('Could not load the media.');
      }
      this.loadedPageId = page.id;
      this.applyPageSettings();
      this.transport.seek(this.range.start);
      this.emit('change');
      await this.preloadNext();
    };
    this.loading = this.loading.then(load, load);
    return this.loading;
  }

  /** With an overlap mark, readies the next page's audio on the free deck so it can start at once. */
  private async preloadNext(): Promise<void> {
    const page = this.page;
    if (this.loadedPageId !== page.id || activeOverlap(page, this.duration) === null) return;
    const next = nextPage(this._project, page.id);
    const media = await this.fetchMedia(next?.audioMediaId ?? null);
    if (!next || !media) return;
    await this.transport.preload(media.blob, Math.max(0, (next.rangeStart ?? 0) - next.audioOffset));
  }

  private async fetchMedia(id: string | null): Promise<MediaRecord | null> {
    if (!id) return null;
    const cached = this.media.get(id);
    if (cached) return cached;
    const record = await getMedia(this.db, id);
    if (record) this.media.set(id, record);
    return record;
  }

  // ---- show mode ----

  /** Show mode locks editing, leaving only what runs the show. */
  get showMode(): boolean {
    return this._showMode;
  }

  setShowMode(on: boolean): void {
    this._showMode = on;
    try {
      localStorage.setItem(SHOW_MODE_KEY, on ? 'on' : 'off');
    } catch {
      // Not remembering it across reloads is fine.
    }
    this.emit('change');
  }

  /** True, with a note to the user, when an edit is refused in show mode. */
  editLocked(): boolean {
    if (this._showMode) {
      this.error('Show mode: editing is locked. Press SHOW to edit.');
      return true;
    }
    // Every edit passes through here first: keep the project as it was, for Undo.
    this.history.record(this._project, performance.now());
    this.editing = true;
    queueMicrotask(() => (this.editing = false));
    return false;
  }

  /** ⌘Z: back one edit. The mixer, the MIDI output and the page on screen stay as they are. */
  undo(): void {
    if (this._showMode) return void this.editLocked();
    const state = this.history.undo(this._project);
    if (state) this.restore(keepLive(state, this._project));
  }

  /** ⇧⌘Z: forward again after Undo. */
  redo(): void {
    if (this._showMode) return void this.editLocked();
    const state = this.history.redo(this._project);
    if (state) this.restore(keepLive(state, this._project));
  }

  /** Puts back a project from the history, reloading the media if the page shown now uses other files. */
  private restore(project: Project): void {
    const before = this.page;
    this._project = project;
    this._cue = reconcile(project, this._cue, before.markers);
    this.autosaver.schedule(project);
    this.applyPageSettings();
    const now = this.page;
    if (now.id !== before.id || now.audioMediaId !== before.audioMediaId || now.videoMediaId !== before.videoMediaId) {
      this.transport.pause();
      void this.loadCurrentPage();
    }
    this.emit('change');
  }

  // ---- MIDI remote ----

  private listenToRemote(): void {
    this.mtc.listen('remote', this._project.settings.midiInputId, (data) => this.remoteMessage(data));
  }

  /** A press on the MIDI input: assigned while learning, else run if it is assigned. Works in show mode. */
  private remoteMessage(data: Uint8Array): void {
    const press = this.presses.read(data);
    if (!press) return;
    if (this.learning) {
      const { action, done } = this.learning;
      this.learning = null;
      this.setRemote(action, press);
      done();
      return;
    }
    const action = remoteAction(press, this._project.settings.midiRemote);
    if (action) this.runRemote(action);
  }

  private runRemote(action: RemoteAction): void {
    ({
      go: () => this.go(),
      playStop: () => this.togglePlay(),
      fadeOut: () => this.fadeOutStop(),
      previousCue: () => this.previousMarker(),
      nextCue: () => this.nextMarker(),
    })[action]();
    this.events.dispatchEvent(new CustomEvent('remote', { detail: action }));
  }

  /** Called with each action a MIDI remote runs, so its button can light up. */
  onRemote(listener: (action: RemoteAction) => void): void {
    this.events.addEventListener('remote', (e) => listener((e as CustomEvent<RemoteAction>).detail));
  }

  setMidiInput(id: string | null): void {
    if (this.editLocked()) return;
    this.commit(updateSettings(this._project, { midiInputId: id }));
    this.listenToRemote();
  }

  /** Learn: the next note or CC on the MIDI input runs this action. Resolves when it arrives or is cancelled. */
  learnRemote(action: RemoteAction): Promise<void> {
    this.learning?.done();
    if (this.editLocked()) return Promise.resolve();
    return new Promise((done) => (this.learning = { action, done }));
  }

  cancelLearn(): void {
    this.learning?.done();
    this.learning = null;
  }

  get learningRemote(): RemoteAction | null {
    return this.learning?.action ?? null;
  }

  /** Assigns a note or CC to an action (null removes it); one note or CC runs one action only. */
  setRemote(action: RemoteAction, trigger: MidiTrigger | null): void {
    if (this.editLocked()) return;
    const same = (t: MidiTrigger) =>
      trigger !== null && t.type === trigger.type && t.channel === trigger.channel && t.number === trigger.number;
    const remote = Object.fromEntries(
      Object.entries(this._project.settings.midiRemote).filter(([a, t]) => a !== action && !same(t)),
    ) as Settings['midiRemote'];
    if (trigger) remote[action] = trigger;
    this.commit(updateSettings(this._project, { midiRemote: remote }));
  }

  // ---- MTC from a DAW ----

  /** The current page follows the MTC coming in: it is set to, and has no audio of its own. */
  get following(): boolean {
    return followsMtc(this.page);
  }

  /** Whether MTC is coming in on the chosen input. */
  get mtcInState(): MtcInputState {
    return this.mtcIn.now(performance.now()).state;
  }

  private listenToMtc(): void {
    this.mtc.listen('mtc', this._project.settings.mtcInputId, (data) => this.mtcIn.read(data, performance.now()));
  }

  setMtcInput(id: string | null): void {
    if (this.editLocked()) return;
    this.commit(updateSettings(this._project, { mtcInputId: id }));
    this.mtcIn.reset();
    this.listenToMtc();
  }

  setFollowMtc(on: boolean): void {
    if (this.editLocked()) return;
    this.commit(updatePage(this._project, this.page.id, { followMtc: on }));
  }

  /** The length of the blank track a page without media has. */
  setBlankLength(seconds: number): void {
    if (this.editLocked()) return;
    this.commit(updatePage(this._project, this.page.id, { blankLength: seconds }));
  }

  /**
   * Every 10 ms on a page that follows MTC: plays while the DAW plays inside the
   * page's in / out points, and stops where the DAW stops or locates.
   */
  private followIncomingMtc(): void {
    if (!this.following || this.loadedPageId !== this.page.id) {
      this.mtcFollowed = null;
      return;
    }
    const { seconds, state } = this.mtcIn.now(performance.now());
    const last = this.mtcFollowed;
    this.mtcFollowed = { state, seconds };
    if (state === 'waiting') return;
    const t = this.transport;
    const { start, end } = this.range;
    const time = seconds - this.page.mtcOffset;
    const held = Math.min(Math.max(time, start), end);
    if (state === 'running') {
      if (time < start || time >= end) {
        // The DAW plays outside this page: wait at the nearer edge.
        if (t.playing) t.pause();
        if (Math.abs(t.now() - held) > FOLLOW_DRIFT) t.seek(held);
      } else if (!t.playing) {
        this.cancelFade();
        t.seek(time);
        t.play();
      } else if (Math.abs(t.now() - time) > FOLLOW_DRIFT) t.follow(time);
      return;
    }
    // Stopped: act once when the DAW stops or locates, so the page can still be played by hand.
    if (last && last.state === 'stopped' && last.seconds === seconds) return;
    if (t.playing) t.pause();
    t.seek(held);
  }

  // ---- transport ----

  go(): void {
    // GO overrules a fade out: back to full level and on with the show.
    this.cancelFade();
    const result = go(this._project, this._cue);
    this._cue = result.state;
    const { action } = result;
    if (action.kind === 'seekAndPlay') {
      this.transport.seek(action.time);
      this.transport.play();
    } else if (action.kind === 'loadPageAndPlay') {
      this._project = setCurrentPage(this._project, action.pageId);
      this.autosaver.schedule(this._project);
      this.applyPageSettings();
      this.transport.pause();
      void this.loadCurrentPage().then(() => {
        this.transport.seek(action.time);
        this.transport.play();
      });
    }
    this.emit('change');
  }

  toggleLoop(): void {
    this.transport.loop = !this.transport.loop;
    this.emit('change');
  }

  /** Follows the page's end action once playback reaches its end. */
  private async handlePageEnd(): Promise<void> {
    // A page ending during a fade out does not start the next one.
    if (this.fadeTimer !== undefined) return this.stop();
    // Nor one following a DAW: it waits for the DAW.
    if (this.following) return;
    const { endAction } = this.page;
    const next = nextPage(this._project, this.page.id);
    if (endAction === 'stop' || !next) return;
    if (next.id === this.page.id) {
      // Looping a single page: start it over.
      this.transport.seek(this.range.start);
      this._cue = initialCueState(this._project, next.id);
      this.emit('change');
    } else {
      this.commit(setCurrentPage(this._project, next.id));
      await this.loading;
    }
    if (endAction === 'nextPlay') this.transport.play();
  }

  /** At the overlap mark the next page starts while this page's audio rings out to its out point. */
  private async handleOverlap(): Promise<void> {
    if (this.fadeTimer !== undefined) return this.stop();
    const next = nextPage(this._project, this.page.id);
    if (!next) return;
    this.transport.handOff(this.range.end);
    this._project = setCurrentPage(this._project, next.id);
    this._cue = initialCueState(this._project, next.id);
    this.autosaver.schedule(this._project);
    this.applyPageSettings();
    this.emit('change');
    await this.loadCurrentPage();
    this.transport.play();
  }

  toggleLoopPages(): void {
    if (this.editLocked()) return;
    this.commit(updateSettings(this._project, { loopPages: !this._project.settings.loopPages }));
  }

  setEndAction(pageId: string, endAction: EndAction): void {
    if (this.editLocked()) return;
    this.commit(updatePage(this._project, pageId, { endAction }));
  }

  togglePlay(): void {
    if (this.transport.playing) this.stop();
    else {
      this.cancelFade();
      this.transport.play();
    }
  }

  /** Stops at once, also ending a fade in progress. */
  stop(): void {
    this.cancelFade();
    this.transport.stop();
  }

  /** Seconds left of a fade out in progress, or 0. */
  get fadeRemaining(): number {
    return this.fadeTimer === undefined ? 0 : Math.max(0, (this.fadeEnd - performance.now()) / 1000);
  }

  /**
   * Esc, as in QLab: fades everything out over the set time, then stops.
   * Pressed again during the fade, it stops at once.
   */
  fadeOutStop(): void {
    if (this.fadeTimer !== undefined) return this.stop();
    if (!this.transport.playing && !this.transport.ringing) return;
    const seconds = this._project.settings.fadeOut;
    if (seconds <= 0) return this.stop();
    this.transport.mixer.fadeAll(seconds);
    this.fadeEnd = performance.now() + seconds * 1000;
    this.fadeTimer = setTimeout(() => this.stop(), seconds * 1000);
    this.emit('change');
  }

  /** Ends a fade (stopped, or overruled by GO or play) and brings the level back. */
  private cancelFade(): void {
    if (this.fadeTimer === undefined) return;
    clearTimeout(this.fadeTimer);
    this.fadeTimer = undefined;
    this.transport.mixer.restoreAll();
    this.emit('change');
  }

  seek(time: number): void {
    this.transport.seek(time);
  }

  toStart(): void {
    this.transport.seek(this.range.start);
  }

  rewind(): void {
    this.transport.skip(-SKIP_SECONDS);
  }

  fastForward(): void {
    this.transport.skip(SKIP_SECONDS);
  }

  previousMarker(): void {
    const now = this.transport.now();
    const marker = [...this.page.markers].reverse().find((m) => m.time < now - MARKER_EPSILON);
    this.transport.seek(marker?.time ?? this.range.start);
    if (marker) this.selectCue(marker.id);
  }

  nextMarker(): void {
    const now = this.transport.now();
    const marker = this.page.markers.find((m) => m.time > now + MARKER_EPSILON);
    if (!marker) return;
    this.transport.seek(marker.time);
    this.selectCue(marker.id);
  }

  /**
   * Every 10 ms while playing: sends the MIDI Notes of the cues reached since the
   * last check, and moves the standby past a cue playback ran through.
   */
  private followPlayback(): void {
    if (!this.transport.playing || this.loadedPageId !== this.page.id) {
      this.noteTime = null;
      return;
    }
    const time = this.transport.now();
    for (const marker of cuesReached(this.page, this.noteTime, time)) {
      this.mtc.sendNote(noteFor(marker, this._project.settings));
    }
    // Not right after a start or jump: GO has already moved the standby on.
    const ranThrough = this.noteTime === null ? [] : cuesPassed(this.page, this.noteTime, time);
    if (ranThrough.length > 0) {
      this._cue = passed(this._project, this._cue, ranThrough[ranThrough.length - 1].id);
      this.emit('change');
    }
    // Following MTC may step back a little; the cues just sent are not sent again.
    this.noteTime = this.noteTime === null ? time : Math.max(this.noteTime, time);
  }

  /** The cue playing: the last one at or before `time`. */
  cueAt(time: number): string | null {
    return this.loadedPageId === this.page.id ? (cueAt(this.page, time)?.id ?? null) : null;
  }

  // ---- markers ----

  addMarkerAtPlayhead(): void {
    if (this.editLocked()) return;
    const page = this.page;
    const result = addMarker(page, this.transport.now(), this.duration);
    this.commit(replacePage(this._project, result.page), page.markers);
    this.selectCue(result.marker.id);
  }

  selectCue(markerId: string): void {
    this._cue = select(this._cue, markerId);
    this.emit('change');
  }

  seekToCue(markerId: string): void {
    const marker = this.page.markers.find((m) => m.id === markerId);
    if (marker) this.transport.seek(marker.time);
  }

  renameMarker(markerId: string, name: string): void {
    if (this.editLocked()) return;
    this.updateCurrentPage((page) => renameMarker(page, markerId, name));
  }

  setMarkerTime(markerId: string, time: number): void {
    if (this.editLocked()) return;
    this.updateCurrentPage((page, duration) => setMarkerTime(page, markerId, time, duration));
  }

  /** MIDI switch, note or memo of a cue. */
  setMarkerFields(markerId: string, patch: MarkerFields): void {
    if (this.editLocked()) return;
    this.updateCurrentPage((page) => setMarkerFields(page, markerId, patch));
  }

  /** The memo of the last cue the playhead passed. */
  memoAt(time: number): string {
    return this.loadedPageId === this.page.id ? memoAt(this.page, time) : '';
  }

  setMemoLook(patch: Partial<Pick<Settings, 'memoSize' | 'memoColor' | 'memoOutline' | 'memoOutlineColor' | 'memoOutlineOn' | 'memoPosition' | 'memoFade' | 'memoFadeOn' | 'memoOutput'>>): void {
    if (this.editLocked()) return;
    this.commit(updateSettings(this._project, patch));
  }

  /** Turns the cues' MIDI Notes on this page on or off as a whole. */
  toggleMidiNotes(): void {
    if (this.editLocked()) return;
    this.commit(updatePage(this._project, this.page.id, { midiNotes: !this.page.midiNotes }));
  }

  setNoteDefaults(patch: Partial<Pick<Settings, 'noteChannel' | 'noteNumber' | 'noteVelocity'>>): void {
    if (this.editLocked()) return;
    this.commit(updateSettings(this._project, patch));
  }

  removeMarker(markerId: string): void {
    if (this.editLocked()) return;
    this.updateCurrentPage((page) => removeMarker(page, markerId));
  }

  /** Places a clip on the timeline; markers move with the audio clip. */
  moveClip(kind: MediaRecord['kind'], offset: number): void {
    if (this.editLocked()) return;
    const durations = { audio: this.transport.audioDuration, video: this.transport.videoDuration };
    const page = this.page;
    this.commit(replacePage(this._project, moveClip(page, kind, offset, durations)), page.markers);
  }

  // ---- in / out points ----

  /** Sets the in / out point or the overlap mark; null clears it. A new range re-arms GO on its first cue. */
  setRangePoint(point: 'start' | 'end' | 'overlap', time: number | null): void {
    if (this.editLocked()) return;
    const page = this.page;
    const set = point === 'start' ? setRangeStart : point === 'end' ? setRangeEnd : setOverlap;
    const updated = set(page, time, this.duration);
    if (updated === page) return;
    this.commit(replacePage(this._project, updated), page.markers);
    if (point === 'overlap') return;
    this._cue = initialCueState(this._project, page.id);
    this.emit('change');
  }

  /** I / O / X: puts the in point, out point or overlap mark at the playhead. */
  setRangePointAtPlayhead(point: 'start' | 'end' | 'overlap'): void {
    this.setRangePoint(point, this.transport.now());
  }

  // ---- pages ----

  selectPage(pageId: string): void {
    this.commit(setCurrentPage(this._project, pageId));
  }

  /** Opens the previous / next page in the list (no wrap-around). */
  selectAdjacentPage(direction: -1 | 1): void {
    const index = this._project.pages.findIndex((p) => p.id === this.page.id);
    const target = this._project.pages[index + direction];
    if (target) this.selectPage(target.id);
  }

  addPage(): void {
    if (this.editLocked()) return;
    this.commit(addPage(this._project, createPage(`Page ${this._project.pages.length + 1}`)));
  }

  renamePage(name: string, pageId = this.page.id): void {
    if (this.editLocked()) return;
    this.commit(renamePage(this._project, pageId, name));
  }

  /** Moves a page to `toIndex` in the list without it. */
  movePage(pageId: string, toIndex: number): void {
    if (this.editLocked()) return;
    this.commit(movePage(this._project, pageId, toIndex));
  }

  removeCurrentPage(): void {
    if (this.editLocked()) return;
    const page = this.page;
    if (this._project.pages.length === 1) {
      this.error('The last page cannot be deleted.');
      return;
    }
    this.commit(removePage(this._project, page.id));
    void this.deleteUnusedMedia([page.audioMediaId, page.videoMediaId]);
  }

  // ---- media ----

  async setMedia(kind: MediaRecord['kind'], file: File): Promise<void> {
    if (this.editLocked()) return;
    let record: MediaRecord;
    try {
      record = await importMediaFile(file, kind);
    } catch (e) {
      this.error(`${file.name}: ${(e as Error).message}`);
      return;
    }
    try {
      await putMedia(this.db, record);
    } catch {
      this.error('Storage is full, so the media was not saved. You will need to re-select it after reloading.');
    }
    this.media.set(record.id, record);
    this.storedMediaIds.add(record.id);
    const page = this.page;
    const previous = kind === 'audio' ? page.audioMediaId : page.videoMediaId;
    const patch = kind === 'audio' ? { audioMediaId: record.id } : { videoMediaId: record.id };
    // The file took a while to read, so the edit's own Redo clearing has lapsed.
    this.history.clearRedo();
    this.commit(updatePage(this._project, page.id, patch));
    await this.loadCurrentPage();
    void this.deleteUnusedMedia([previous]);
  }

  async clearMedia(kind: MediaRecord['kind']): Promise<void> {
    if (this.editLocked()) return;
    const page = this.page;
    const previous = kind === 'audio' ? page.audioMediaId : page.videoMediaId;
    const patch = kind === 'audio' ? { audioMediaId: null } : { videoMediaId: null };
    this.commit(updatePage(this._project, page.id, patch));
    await this.loadCurrentPage();
    void this.deleteUnusedMedia([previous]);
  }

  private async deleteUnusedMedia(ids: (string | null)[]): Promise<void> {
    for (const id of ids) {
      if (!id) continue;
      // Media an Undo could bring back stays too.
      const projects = [this._project, ...this.history.states()];
      const used = projects.some((pr) => pr.pages.some((p) => p.audioMediaId === id || p.videoMediaId === id));
      if (used) continue;
      this.media.delete(id);
      this.storedMediaIds.delete(id);
      await deleteMedia(this.db, id).catch(() => {});
    }
  }

  // ---- settings ----

  setFps(fps: Fps): void {
    if (this.editLocked()) return;
    this.commit(updateSettings(this._project, { mtcFps: fps }));
  }

  setMidiOutput(id: string | null): void {
    if (this.editLocked()) return;
    this.mtc.selectOutput(id);
    this.commit(updateSettings(this._project, { midiOutputId: id }));
  }

  setFadeOut(seconds: number): void {
    if (this.editLocked()) return;
    this.commit(updateSettings(this._project, { fadeOut: seconds }));
  }

  setPageOffset(seconds: number): void {
    if (this.editLocked()) return;
    this.commit(updatePage(this._project, this.page.id, { mtcOffset: seconds }));
  }

  setTrackLevel(kind: MediaRecord['kind'], volume: number, muted: boolean): void {
    const patch =
      kind === 'audio'
        ? { audioVolume: volume, audioMuted: muted }
        : { videoAudioVolume: volume, videoAudioEnabled: !muted };
    this.commit(updatePage(this._project, this.page.id, patch));
  }

  setTrackPan(kind: MediaRecord['kind'], pan: number): void {
    this.commit(updatePage(this._project, this.page.id, kind === 'audio' ? { audioPan: pan } : { videoPan: pan }));
  }

  setMaster(patch: Partial<Pick<Settings, 'masterVolume' | 'masterMuted' | 'masterPan'>>): void {
    this.commit(updateSettings(this._project, patch));
  }

  // ---- import / export ----

  /** The project file; a backup passes where each media file sits in its media folder. */
  exportJson(files?: Record<string, string>): string {
    const ids = this._project.pages.flatMap((p) => [p.audioMediaId, p.videoMediaId]);
    const media = ids.flatMap((id) => this.mediaFor(id) ?? []);
    return exportProjectJson(this._project, media, files);
  }

  /** Every media file the pages use, once each, read from the browser's store. */
  async mediaRecords(): Promise<MediaRecord[]> {
    const ids = new Set(this._project.pages.flatMap((p) => [p.audioMediaId, p.videoMediaId]));
    const records = await Promise.all([...ids].map((id) => this.fetchMedia(id)));
    return records.filter((r): r is MediaRecord => r !== null);
  }

  /** Media the pages use but this browser does not have, with the file names to look for. */
  missingMedia(): { id: string; kind: MediaRecord['kind']; fileName: string }[] {
    const missing = new Map<string, { id: string; kind: MediaRecord['kind']; fileName: string }>();
    for (const page of this._project.pages) {
      for (const [id, kind] of [[page.audioMediaId, 'audio'], [page.videoMediaId, 'video']] as const) {
        if (!id || this.storedMediaIds.has(id) || missing.has(id)) continue;
        const fileName = this.importedMediaNames[id];
        if (fileName) missing.set(id, { id, kind, fileName });
      }
    }
    return [...missing.values()];
  }

  /**
   * Stores media files under the ids the pages already use (restoring a backup,
   * or files found again). Returns how many could not be read.
   */
  async restoreMedia(
    items: { id: string; kind: MediaRecord['kind']; file: File }[],
    onProgress: (done: number, total: number) => void = () => {},
  ): Promise<number> {
    if (this.editLocked()) return items.length;
    let failed = 0;
    for (const [i, { id, kind, file }] of items.entries()) {
      onProgress(i, items.length);
      try {
        const record = { ...(await importMediaFile(file, kind)), id };
        await putMedia(this.db, record);
        this.media.set(id, record);
        this.storedMediaIds.add(id);
      } catch {
        failed++;
      }
    }
    onProgress(items.length, items.length);
    await this.loadCurrentPage();
    return failed;
  }

  /** Media names from the last imported file, keyed by media id, for "please re-select" hints. */
  importedMediaNames: Record<string, string> = {};

  /** Returns false when the file could not be read. */
  async importJson(text: string): Promise<boolean> {
    if (this.editLocked()) return false;
    let imported: ReturnType<typeof importProjectJson>;
    try {
      imported = importProjectJson(text);
    } catch (e) {
      this.error(`Import failed: ${(e as Error).message}`);
      return false;
    }
    this.importedMediaNames = Object.fromEntries(
      Object.entries(imported.media).map(([id, m]) => [id, m.fileName]),
    );
    await this.replaceProject(imported.project);
    return true;
  }

  async newProject(): Promise<void> {
    if (this.editLocked()) return;
    this.importedMediaNames = {};
    await this.replaceProject(createProject());
  }

  private async replaceProject(project: Project): Promise<void> {
    // A new or opened show starts its own history.
    this.history.clear();
    this.transport.pause();
    this._project = project;
    this._cue = initialCueState(project, project.currentPageId);
    this.autosaver.schedule(project);
    this.applyPageSettings();
    this.mtc.selectOutput(project.settings.midiOutputId);
    this.listenToRemote();
    this.mtcIn.reset();
    this.listenToMtc();
    await this.loadCurrentPage();
  }
}
