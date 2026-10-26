import { pageDuration } from '../model/clips';
import { playRange, type PlayRange } from '../model/range';
import { ClockInterpolator, PageClock } from './clock';
import { Mixer, type ChannelKey, type StripKind } from './mixer';
import { VideoDecks, type VideoView } from './videoDecks';

export type TransportEvent = 'load' | 'playstate' | 'locate' | 'ended' | 'overlap';

/** One of the two audio players; the page's audio plays on one while the other rings out or waits. */
type Deck = { element: HTMLAudioElement; url: string | null; blob: Blob | null };

function waitForMetadata(element: HTMLMediaElement): Promise<void> {
  if (element.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    element.addEventListener('loadedmetadata', () => resolve(), { once: true });
    element.addEventListener('error', () => reject(new Error('Could not load media')), { once: true });
  });
}

const finiteDuration = (element: HTMLMediaElement) => (Number.isFinite(element.duration) ? element.duration : 0);

/**
 * Plays one page. The page has its own timeline clock; the audio and video
 * clips sit on it at their offsets. While the audio clip plays it drives the
 * clock, so the music itself is never corrected.
 *
 * The audio alternates between two decks: at a page's overlap mark its audio
 * rings out on its deck while the next page starts on the other one. The video
 * does the same on its own two decks, dissolving into the next page's.
 */
export class Transport {
  private readonly decks: [Deck, Deck] = [0, 1].map(() => {
    const element = new Audio();
    element.preload = 'auto';
    return { element, url: null, blob: null };
  }) as [Deck, Deck];
  private deck: 0 | 1 = 0;
  /** The previous page's audio ringing out after an overlap, until `end` in its clip time. */
  private tail: { deck: 0 | 1; end: number } | null = null;
  /** A preload that waits for the ringing deck to come free. */
  private pendingPreload: { blob: Blob; time: number } | null = null;
  readonly video: VideoDecks;
  readonly mixer: Mixer;
  private readonly clock = new PageClock();
  private readonly audioClock = new ClockInterpolator();
  private readonly events = new EventTarget();
  private hasAudio = false;
  private hasVideo = false;
  private audioOffset = 0;
  private videoOffset = 0;
  private _duration = 0;
  /** How long the page is while it has no audio or video. */
  private blankLength = 0;
  private rangeStart: number | null = null;
  private rangeEnd: number | null = null;
  private overlapAt: number | null = null;
  /** The time of the last tick or seek, to see playback cross the out point. */
  private lastTime = 0;
  private _playing = false;
  /** When on, playback jumps back to the in point at the out point. */
  loop = false;

  constructor(monitor: VideoView) {
    this.mixer = new Mixer({ decks: [this.decks[0].element, this.decks[1].element], videos: monitor });
    // The previous page's video sound goes quiet with its picture.
    this.video = new VideoDecks(monitor, (deck) => this.mixer.fadeOut(`video${deck}`));
  }

  /** The current page's audio player. */
  private get audio(): HTMLAudioElement {
    return this.decks[this.deck].element;
  }

  /** The mixer channel of a strip: the Audio and Video strips are whichever decks play the current page. */
  channel(kind: StripKind): ChannelKey {
    if (kind === 'audio') return `deck${this.deck}`;
    return kind === 'video' ? `video${this.video.deck}` : kind;
  }

  levels(kind: StripKind): [number, number] {
    return this.mixer.levels(this.channel(kind));
  }

  /** Where playback hands over to the next page (page time), or null for none. */
  setOverlap(time: number | null): void {
    this.overlapAt = time;
  }

  private setSource(deck: Deck, blob: Blob | null): void {
    deck.element.pause();
    if (deck.url) URL.revokeObjectURL(deck.url);
    deck.url = blob ? URL.createObjectURL(blob) : null;
    deck.blob = blob;
    if (deck.url) deck.element.src = deck.url;
    else {
      deck.element.removeAttribute('src');
      deck.element.load();
    }
  }

  /** Loads the next page's video onto its free deck, cued at `time` in its clip, so an overlap shows it at once. */
  preloadVideo(blob: Blob, time: number): Promise<void> {
    return this.video.preload(blob, time);
  }

  /** Loads the next page's audio onto the free deck, cued at `time` in its clip, so an overlap starts it at once. */
  async preload(blob: Blob, time: number): Promise<void> {
    if (this.tail) {
      this.pendingPreload = { blob, time };
      return;
    }
    const idle = this.decks[1 - this.deck];
    if (idle.blob !== blob) this.setSource(idle, blob);
    try {
      await waitForMetadata(idle.element);
      if (idle.blob === blob && idle !== this.decks[this.deck]) idle.element.currentTime = time;
    } catch {
      if (idle.blob === blob) this.setSource(idle, null);
    }
  }

  /**
   * At the overlap mark: stops the page clock but lets its audio ring out up to
   * `end` (page time), and moves the page over to the other deck.
   */
  handOff(end: number): void {
    if (!this._playing) return;
    const time = this.now();
    this._playing = false;
    this.clock.stop(time);
    // Only one page can ring out; the deck it uses is about to take the next page.
    this.stopTail(false);
    if (this.hasAudio && !this.audio.paused) this.tail = { deck: this.deck, end: end - this.audioOffset };
    else this.audio.pause();
    this.deck = this.deck === 0 ? 1 : 0;
    this.hasAudio = false;
    // The picture dissolves into the next page's over the same time the audio rings out.
    this.video.handOff(this.hasVideo ? time - this.videoOffset : null, end - time);
    this.hasVideo = false;
    this.emit('playstate');
  }

  /** Ends the ringing out: with a short fade, or at once when its deck is needed right away. */
  private stopTail(fade: boolean): void {
    const tail = this.tail;
    if (!tail) return;
    this.tail = null;
    const deck = this.decks[tail.deck];
    const finish = () => {
      if (deck !== this.decks[this.deck]) deck.element.pause();
      const pending = this.pendingPreload;
      this.pendingPreload = null;
      if (pending) void this.preload(pending.blob, pending.time);
    };
    if (!fade) return finish();
    this.mixer.fadeOut(`deck${tail.deck}`);
    setTimeout(finish, 80);
  }

  /** A previous page is still ringing out (or its video dissolving) after an overlap. */
  get ringing(): boolean {
    return this.tail !== null || this.video.fading;
  }

  /** Pauses and also silences a page still ringing out. */
  stop(): void {
    this.pause();
    this.stopTail(true);
    this.video.stopTail();
  }

  get duration(): number {
    return this._duration;
  }

  /** The part of the page that plays. */
  get range(): PlayRange {
    return playRange({ rangeStart: this.rangeStart, rangeEnd: this.rangeEnd }, this._duration);
  }

  /** Sets the page's in / out points (null is the page's start / end). */
  setRange(start: number | null, end: number | null): void {
    this.rangeStart = start;
    this.rangeEnd = end;
  }

  get audioDuration(): number | null {
    return this.hasAudio ? finiteDuration(this.audio) : null;
  }

  get videoDuration(): number | null {
    return this.hasVideo ? finiteDuration(this.video.element) : null;
  }

  get hasMedia(): boolean {
    return this.hasAudio || this.hasVideo;
  }

  /** The length of the page while it has no audio or video: a blank track to put cues on. */
  setBlankLength(seconds: number): void {
    this.blankLength = seconds;
    this.setOffsets(this.audioOffset, this.videoOffset);
  }

  get playing(): boolean {
    return this._playing;
  }

  on(event: TransportEvent, listener: () => void): void {
    this.events.addEventListener(event, listener);
  }

  private emit(event: TransportEvent): void {
    this.events.dispatchEvent(new Event(event));
  }

  async load(audio: Blob | null, video: Blob | null, audioOffset: number, videoOffset: number): Promise<void> {
    this.pause();
    // A preloaded deck keeps its audio, ready and cued.
    const deck = this.decks[this.deck];
    const preloaded = audio !== null && deck.blob === audio;
    this.unload(preloaded);
    if (audio && !preloaded) this.setSource(deck, audio);
    this.hasAudio = audio !== null;
    this.hasVideo = video !== null;
    try {
      await Promise.all([audio && waitForMetadata(this.audio), this.video.load(video)]);
    } finally {
      this.setOffsets(audioOffset, videoOffset);
      this.clock.stop(0);
      this.emit('load');
    }
  }

  private unload(keepAudio: boolean): void {
    if (!keepAudio) this.setSource(this.decks[this.deck], null);
    this.hasAudio = this.hasVideo = false;
    this._duration = 0;
  }

  /** Moves the clips on the timeline. */
  setOffsets(audioOffset: number, videoOffset: number): void {
    // Page settings are re-applied on every edit (e.g. each volume step); relocating
    // the audio then would click, so only a real move does.
    const moved = audioOffset !== this.audioOffset;
    this.audioOffset = audioOffset;
    this.videoOffset = videoOffset;
    this._duration = this.hasMedia
      ? pageDuration(
          { audioMediaId: this.hasAudio ? 'a' : null, videoMediaId: this.hasVideo ? 'v' : null, audioOffset, videoOffset },
          { audio: this.audioDuration, video: this.videoDuration },
        )
      : this.blankLength;
    if (moved) this.syncAudio(this.now(), true);
  }

  /** The page time read from the audio while it is actually playing, else null. */
  private audioPageTime(nowMs: number): number | null {
    const audio = this.audio;
    const locked =
      this._playing &&
      this.hasAudio &&
      !audio.paused &&
      !audio.seeking &&
      audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
    const time = this.audioClock.update(audio.currentTime, locked, nowMs);
    return locked ? this.audioOffset + time : null;
  }

  now(): number {
    const time = this.clock.now(performance.now(), this.audioPageTime(performance.now()));
    return Math.min(Math.max(time, 0), this._duration);
  }

  play(): void {
    if (this._duration <= 0) return;
    void this.mixer.resume();
    const { start, end } = this.range;
    // From the out point on, play starts over at the in point.
    const from = this.now() >= end ? start : this.now();
    this.lastTime = from;
    this._playing = true;
    this.clock.start(from, performance.now());
    this.syncAudio(from, true);
    this.emit('playstate');
  }

  pause(): void {
    if (!this._playing) return;
    const time = this.now();
    this._playing = false;
    this.clock.stop(time);
    this.audio.pause();
    this.emit('playstate');
  }

  toggle(): void {
    if (this._playing) this.stop();
    else this.play();
  }

  seek(time: number): void {
    if (this._duration <= 0) return;
    const target = Math.min(Math.max(time, 0), this._duration);
    this.lastTime = target;
    if (this._playing) this.clock.start(target, performance.now());
    else this.clock.stop(target);
    this.syncAudio(target, true);
    this.emit('locate');
  }

  /**
   * Keeps playing from `time` without counting it as a jump: following MTC
   * corrects small drift this way, so the cues in between still fire.
   */
  follow(time: number): void {
    if (!this._playing) return;
    const target = Math.min(Math.max(time, 0), this._duration);
    this.clock.start(target, performance.now());
    this.syncAudio(target, true);
  }

  skip(delta: number): void {
    this.seek(this.now() + delta);
  }

  /** Starts, stops or relocates the audio so it matches the page time. */
  private syncAudio(time: number, force: boolean): void {
    if (!this.hasAudio) return;
    const audio = this.audio;
    const clipTime = time - this.audioOffset;
    const inClip = clipTime >= 0 && clipTime < finiteDuration(audio);
    if (!this._playing || !inClip) {
      if (!audio.paused) audio.pause();
      if (force) audio.currentTime = Math.min(Math.max(clipTime, 0), finiteDuration(audio));
      return;
    }
    if (force) audio.currentTime = clipTime;
    if (audio.paused) {
      if (!force) audio.currentTime = clipTime;
      void audio.play().catch(() => {});
    }
  }

  /** Call every animation frame: follows the clips and returns the current time. */
  tick(): number {
    if (this.tail) {
      const element = this.decks[this.tail.deck].element;
      if (element.paused || element.currentTime >= this.tail.end) this.stopTail(true);
    }
    const time = this.now();
    const overlap = this.overlapAt;
    if (this._playing && !this.loop && overlap !== null && this.lastTime < overlap && time >= overlap) {
      this.lastTime = time;
      this.emit('overlap');
      return this.now();
    }
    const { start, end } = this.range;
    // Playback started past the out point runs on to the end of the page.
    const ended = time >= this._duration || (this.lastTime < end && time >= end);
    this.lastTime = time;
    if (this._playing && ended) {
      if (this.loop) this.seek(start);
      else {
        this.pause();
        this.emit('ended');
      }
      return this.now();
    }
    this.syncAudio(time, false);
    this.video.tick(time - this.videoOffset, this._playing, this.hasVideo);
    return time;
  }
}
