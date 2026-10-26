import { VideoSync } from './videoSync';

/** The two stacked video elements a screen (the monitor, the video output) shows the decks on. */
export type VideoView = [HTMLVideoElement, HTMLVideoElement];

type Deck = { blob: Blob | null; url: string | null; sync: VideoSync };

/** The previous page's video after an overlap: it plays on, under the next page's, until the dissolve ends. */
type Tail = { deck: 0 | 1; clipStart: number; startedAt: number; length: number };

function waitForMetadata(element: HTMLMediaElement): Promise<void> {
  if (element.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    element.addEventListener('loadedmetadata', () => resolve(), { once: true });
    element.addEventListener('error', () => reject(new Error('Could not load media')), { once: true });
  });
}

/**
 * The video alternates between two decks, as the audio does: at a page's
 * overlap mark its video plays on while the next page's dissolves in over it,
 * from the mark to the previous page's out point.
 */
export class VideoDecks {
  private readonly views: VideoView[] = [];
  private readonly decks: [Deck, Deck] = [0, 1].map(() => ({ blob: null, url: null, sync: new VideoSync() })) as [Deck, Deck];
  private current: 0 | 1 = 0;
  private tail: Tail | null = null;
  /** A preload that waits for the fading deck to come free. */
  private pendingPreload: { blob: Blob; time: number } | null = null;
  private readonly onTailEnd: (deck: 0 | 1) => void;

  /** The first view is the monitor: its elements carry the Video track's sound and are measured. */
  constructor(monitor: VideoView, onTailEnd: (deck: 0 | 1) => void) {
    this.onTailEnd = onTailEnd;
    this.addView(monitor);
  }

  /** The deck the current page's video plays on. */
  get deck(): 0 | 1 {
    return this.current;
  }

  /** The current page's video on the monitor. */
  get element(): HTMLVideoElement {
    return this.views[0][this.current];
  }

  get fading(): boolean {
    return this.tail !== null;
  }

  addView(view: VideoView): void {
    this.views.push(view);
    view.forEach((video, i) => {
      video.preload = 'auto';
      video.playsInline = true;
      const { url, sync } = this.decks[i];
      if (url) video.src = url;
      sync.add(video);
    });
    this.layer(0);
  }

  removeView(view: VideoView): void {
    const index = this.views.indexOf(view);
    if (index > 0) this.views.splice(index, 1);
    view.forEach((video, i) => this.decks[i].sync.remove(video));
  }

  private setSource(index: 0 | 1, blob: Blob | null): void {
    const deck = this.decks[index];
    if (deck.url) URL.revokeObjectURL(deck.url);
    deck.url = blob ? URL.createObjectURL(blob) : null;
    deck.blob = blob;
    for (const view of this.views) {
      const video = view[index];
      video.pause();
      if (deck.url) video.src = deck.url;
      else {
        video.removeAttribute('src');
        video.load();
      }
    }
  }

  /** Puts the current page's video on its deck; a preloaded deck keeps it, ready and cued. Resolves once it can be measured. */
  async load(blob: Blob | null): Promise<void> {
    if (this.decks[this.current].blob !== blob) this.setSource(this.current, blob);
    if (blob) await waitForMetadata(this.element);
  }

  /** Loads the next page's video onto the free deck, cued at `time` in its clip, so an overlap shows it at once. */
  async preload(blob: Blob, time: number): Promise<void> {
    if (this.tail) {
      this.pendingPreload = { blob, time };
      return;
    }
    const idle = (1 - this.current) as 0 | 1;
    if (this.decks[idle].blob !== blob) this.setSource(idle, blob);
    try {
      await waitForMetadata(this.views[0][idle]);
      if (this.decks[idle].blob === blob && idle !== this.current) {
        for (const view of this.views) view[idle].currentTime = Math.max(0, time);
      }
    } catch {
      if (this.decks[idle].blob === blob) this.setSource(idle, null);
    }
  }

  /**
   * At the overlap mark: the current video plays on from `clipTime` and fades
   * out over `length` seconds, while the next page takes the other deck.
   */
  handOff(clipTime: number | null, length: number): void {
    this.stopTail();
    if (clipTime !== null && length > 0) {
      this.tail = { deck: this.current, clipStart: clipTime, startedAt: performance.now(), length };
    } else {
      for (const view of this.views) view[this.current].pause();
    }
    this.current = (1 - this.current) as 0 | 1;
  }

  /** Ends the dissolve at once, hiding the previous page's video. */
  stopTail(): void {
    const tail = this.tail;
    if (!tail) return;
    this.tail = null;
    for (const view of this.views) view[tail.deck].pause();
    this.onTailEnd(tail.deck);
    const pending = this.pendingPreload;
    this.pendingPreload = null;
    if (pending) void this.preload(pending.blob, pending.time);
  }

  /** Call every frame with the current page's clip time; also runs the dissolve. */
  tick(clipTime: number, playing: boolean, hasVideo: boolean): void {
    this.decks[this.current].sync.tick(clipTime, playing);
    let progress = 1;
    if (this.tail) {
      const elapsed = (performance.now() - this.tail.startedAt) / 1000;
      progress = Math.min(1, elapsed / this.tail.length);
      if (progress >= 1) this.stopTail();
      else this.decks[this.tail.deck].sync.tick(this.tail.clipStart + elapsed, true);
    }
    this.layer(progress, hasVideo);
  }

  /** The current page's video on top, dissolving in over the previous page's; an idle deck is hidden. */
  private layer(progress: number, hasVideo = true): void {
    const tail = this.tail?.deck ?? null;
    for (const view of this.views) {
      view.forEach((video, i) => {
        const opacity = i === this.current ? progress : i === tail ? (hasVideo ? 1 : 1 - progress) : 0;
        video.style.opacity = String(opacity);
        video.style.zIndex = i === this.current ? '1' : '0';
      });
    }
  }
}
