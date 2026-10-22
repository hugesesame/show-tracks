import { go, initialCueState, reconcile, select, type CueState } from '../cue/cueController';
import { MtcOutput } from '../engine/mtc';
import type { Fps } from '../engine/timecode';
import { Transport } from '../engine/transport';
import { importMediaFile } from '../media/importMedia';
import { moveClip } from '../model/clips';
import { addMarker, removeMarker, renameMarker, setMarkerTime } from '../model/markers';
import {
  addPage,
  createPage,
  currentPage,
  movePage,
  removePage,
  renamePage,
  replacePage,
  setCurrentPage,
  updatePage,
  updateSettings,
} from '../model/project';
import type { EndAction, MediaRecord, Page, Project } from '../model/types';
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
/** Markers this close to the playhead count as "here" for prev/next jumps. */
const MARKER_EPSILON = 0.05;

export class App {
  readonly transport: Transport;
  readonly mtc: MtcOutput;
  readonly output: OutputWindow;
  private _project: Project;
  private _cue: CueState;
  private readonly media = new Map<string, MediaRecord>();
  private storedMediaIds = new Set<string>();
  private loadedPageId: string | null = null;
  private loading: Promise<void> = Promise.resolve();
  private readonly autosaver: Autosaver;
  private readonly events = new EventTarget();

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
    this.autosaver = createAutosaver(
      (p) => saveProject(db, p),
      () => this.error('Saving failed. Storage may be full.'),
    );
    this.transport.on('locate', () => this.mtc.locate(this.transport.now()));
    this.transport.on('playstate', () => {
      if (!this.transport.playing) this.mtc.locate(this.transport.now());
      this.emit('change');
    });
    this.transport.on('load', () => this.emit('change'));
    this.transport.on('ended', () => void this.handlePageEnd());
    window.addEventListener('pagehide', () => {
      const unsaved = this.autosaver.pending();
      if (unsaved) stashUnsaved(unsaved);
    });
  }

  async start(): Promise<void> {
    this.storedMediaIds = await listMediaIds(this.db);
    this.applyPageSettings();
    await this.loadCurrentPage();
    await this.mtc.init();
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
    const pageChanged = project.currentPageId !== this._project.currentPageId;
    this._project = project;
    this._cue = reconcile(project, this._cue, previousMarkers);
    this.autosaver.schedule(project);
    this.applyPageSettings();
    if (pageChanged && this.loadedPageId !== project.currentPageId) {
      this.transport.pause();
      void this.loadCurrentPage();
    }
    this.emit('change');
  }

  private updateCurrentPage(update: (page: Page, duration: number) => Page): void {
    const page = this.page;
    this.commit(replacePage(this._project, update(page, this.duration)), page.markers);
  }

  private applyPageSettings(): void {
    const page = this.page;
    if (this.loadedPageId === page.id) this.transport.setOffsets(page.audioOffset, page.videoOffset);
    this.transport.mixer.setLevel('audio', page.audioVolume, page.audioMuted);
    this.transport.mixer.setLevel('video', page.videoAudioVolume, !page.videoAudioEnabled);
    this.mtc.configure(this._project.settings.mtcFps, page.mtcOffset);
  }

  private async loadCurrentPage(): Promise<void> {
    const load = async () => {
      const page = this.page;
      const [audio, video] = await Promise.all([this.fetchMedia(page.audioMediaId), this.fetchMedia(page.videoMediaId)]);
      try {
        await this.transport.load(audio?.blob ?? null, video?.blob ?? null, page.audioOffset, page.videoOffset);
      } catch {
        this.error('Could not load the media.');
      }
      this.loadedPageId = page.id;
      this.applyPageSettings();
      this.emit('change');
    };
    this.loading = this.loading.then(load, load);
    return this.loading;
  }

  private async fetchMedia(id: string | null): Promise<MediaRecord | null> {
    if (!id) return null;
    const cached = this.media.get(id);
    if (cached) return cached;
    const record = await getMedia(this.db, id);
    if (record) this.media.set(id, record);
    return record;
  }

  // ---- transport ----

  go(): void {
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
    const { endAction } = this.page;
    const index = this._project.pages.findIndex((p) => p.id === this.page.id);
    const next = this._project.pages[index + 1];
    if (endAction === 'stop' || !next) return;
    this.commit(setCurrentPage(this._project, next.id));
    await this.loading;
    if (endAction === 'nextPlay') this.transport.play();
  }

  setEndAction(pageId: string, endAction: EndAction): void {
    this.commit(updatePage(this._project, pageId, { endAction }));
  }

  togglePlay(): void {
    this.transport.toggle();
  }

  stop(): void {
    this.transport.pause();
  }

  seek(time: number): void {
    this.transport.seek(time);
  }

  toStart(): void {
    this.transport.seek(0);
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
    this.transport.seek(marker?.time ?? 0);
    if (marker) this.selectCue(marker.id);
  }

  nextMarker(): void {
    const now = this.transport.now();
    const marker = this.page.markers.find((m) => m.time > now + MARKER_EPSILON);
    if (!marker) return;
    this.transport.seek(marker.time);
    this.selectCue(marker.id);
  }

  // ---- markers ----

  addMarkerAtPlayhead(): void {
    if (!this.transport.hasMedia) {
      this.error('Load audio or video first.');
      return;
    }
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
    this.updateCurrentPage((page) => renameMarker(page, markerId, name));
  }

  setMarkerTime(markerId: string, time: number): void {
    this.updateCurrentPage((page, duration) => setMarkerTime(page, markerId, time, duration));
  }

  removeMarker(markerId: string): void {
    this.updateCurrentPage((page) => removeMarker(page, markerId));
  }

  /** Places a clip on the timeline; markers move with the audio clip. */
  moveClip(kind: MediaRecord['kind'], offset: number): void {
    const durations = { audio: this.transport.audioDuration, video: this.transport.videoDuration };
    const page = this.page;
    this.commit(replacePage(this._project, moveClip(page, kind, offset, durations)), page.markers);
  }

  // ---- pages ----

  selectPage(pageId: string): void {
    this.commit(setCurrentPage(this._project, pageId));
  }

  addPage(): void {
    this.commit(addPage(this._project, createPage(`Page ${this._project.pages.length + 1}`)));
  }

  renamePage(name: string, pageId = this.page.id): void {
    this.commit(renamePage(this._project, pageId, name));
  }

  /** Moves a page to `toIndex` in the list without it. */
  movePage(pageId: string, toIndex: number): void {
    this.commit(movePage(this._project, pageId, toIndex));
  }

  removeCurrentPage(): void {
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
    this.commit(updatePage(this._project, page.id, patch));
    await this.loadCurrentPage();
    void this.deleteUnusedMedia([previous]);
  }

  async clearMedia(kind: MediaRecord['kind']): Promise<void> {
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
      const used = this._project.pages.some((p) => p.audioMediaId === id || p.videoMediaId === id);
      if (used) continue;
      this.media.delete(id);
      this.storedMediaIds.delete(id);
      await deleteMedia(this.db, id).catch(() => {});
    }
  }

  // ---- settings ----

  setFps(fps: Fps): void {
    this.commit(updateSettings(this._project, { mtcFps: fps }));
  }

  setMidiOutput(id: string | null): void {
    this.mtc.selectOutput(id);
    this.commit(updateSettings(this._project, { midiOutputId: id }));
  }

  setPageOffset(seconds: number): void {
    this.commit(updatePage(this._project, this.page.id, { mtcOffset: seconds }));
  }

  setTrackLevel(kind: MediaRecord['kind'], volume: number, muted: boolean): void {
    const patch =
      kind === 'audio'
        ? { audioVolume: volume, audioMuted: muted }
        : { videoAudioVolume: volume, videoAudioEnabled: !muted };
    this.commit(updatePage(this._project, this.page.id, patch));
  }

  // ---- import / export ----

  exportJson(): string {
    const ids = this._project.pages.flatMap((p) => [p.audioMediaId, p.videoMediaId]);
    const media = ids.flatMap((id) => this.mediaFor(id) ?? []);
    return exportProjectJson(this._project, media);
  }

  /** Media names from the last imported file, keyed by media id, for "please re-select" hints. */
  importedMediaNames: Record<string, string> = {};

  async importJson(text: string): Promise<void> {
    let imported: ReturnType<typeof importProjectJson>;
    try {
      imported = importProjectJson(text);
    } catch (e) {
      this.error(`Import failed: ${(e as Error).message}`);
      return;
    }
    this.transport.pause();
    this.importedMediaNames = Object.fromEntries(
      Object.entries(imported.media).map(([id, m]) => [id, m.fileName]),
    );
    this._project = imported.project;
    this._cue = initialCueState(imported.project, imported.project.currentPageId);
    this.autosaver.schedule(imported.project);
    this.applyPageSettings();
    this.mtc.selectOutput(imported.project.settings.midiOutputId);
    await this.loadCurrentPage();
  }
}
