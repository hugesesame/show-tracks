import { pageDuration } from '../model/clips';
import { playRange, type PlayRange } from '../model/range';
import { ClockInterpolator, PageClock } from './clock';
import { Mixer } from './mixer';
import { VideoSync } from './videoSync';

export type TransportEvent = 'load' | 'playstate' | 'locate' | 'ended';

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
 */
export class Transport {
  readonly audio = new Audio();
  readonly videoSync = new VideoSync();
  readonly mixer: Mixer;
  private readonly clock = new PageClock();
  private readonly audioClock = new ClockInterpolator();
  private readonly events = new EventTarget();
  private hasAudio = false;
  private hasVideo = false;
  private audioOffset = 0;
  private videoOffset = 0;
  private audioUrl: string | null = null;
  private _videoUrl: string | null = null;
  private _duration = 0;
  private rangeStart: number | null = null;
  private rangeEnd: number | null = null;
  /** The time of the last tick or seek, to see playback cross the out point. */
  private lastTime = 0;
  private _playing = false;
  /** When on, playback jumps back to the in point at the out point. */
  loop = false;

  constructor(readonly monitor: HTMLVideoElement) {
    this.audio.preload = 'auto';
    monitor.preload = 'auto';
    monitor.playsInline = true;
    this.mixer = new Mixer({ audio: this.audio, video: monitor });
    this.videoSync.add(monitor);
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
    return this.hasVideo ? finiteDuration(this.monitor) : null;
  }

  get videoUrl(): string | null {
    return this._videoUrl;
  }

  get hasMedia(): boolean {
    return this.hasAudio || this.hasVideo;
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
    this.unload();
    if (audio) {
      this.audioUrl = URL.createObjectURL(audio);
      this.audio.src = this.audioUrl;
    }
    if (video) {
      this._videoUrl = URL.createObjectURL(video);
      this.monitor.src = this._videoUrl;
    }
    this.hasAudio = audio !== null;
    this.hasVideo = video !== null;
    try {
      await Promise.all([audio && waitForMetadata(this.audio), video && waitForMetadata(this.monitor)]);
    } finally {
      this.setOffsets(audioOffset, videoOffset);
      this.clock.stop(0);
      this.emit('load');
    }
  }

  private unload(): void {
    for (const element of [this.audio, this.monitor]) {
      element.removeAttribute('src');
      element.load();
    }
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    if (this._videoUrl) URL.revokeObjectURL(this._videoUrl);
    this.audioUrl = this._videoUrl = null;
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
    this._duration = pageDuration(
      { audioMediaId: this.hasAudio ? 'a' : null, videoMediaId: this.hasVideo ? 'v' : null, audioOffset, videoOffset },
      { audio: this.audioDuration, video: this.videoDuration },
    );
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
    if (!this.hasMedia) return;
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
    if (this._playing) this.pause();
    else this.play();
  }

  seek(time: number): void {
    if (!this.hasMedia) return;
    const target = Math.min(Math.max(time, 0), this._duration);
    this.lastTime = target;
    if (this._playing) this.clock.start(target, performance.now());
    else this.clock.stop(target);
    this.syncAudio(target, true);
    this.emit('locate');
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
    const time = this.now();
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
    this.videoSync.tick(time - this.videoOffset, this._playing);
    return time;
  }
}
