import { MediaClock } from './clock';
import { VideoSync } from './videoSync';

export type TransportEvent = 'load' | 'playstate' | 'locate';

function waitForMetadata(element: HTMLMediaElement): Promise<void> {
  if (element.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    element.addEventListener('loadedmetadata', () => resolve(), { once: true });
    element.addEventListener('error', () => reject(new Error('メディアを読み込めません')), { once: true });
  });
}

/**
 * Plays one page. The audio element is the master clock when the page has
 * audio; otherwise the monitor video is. Videos that are not the master follow it.
 */
export class Transport {
  readonly audio = new Audio();
  readonly videoSync = new VideoSync();
  private readonly clock = new MediaClock();
  private readonly events = new EventTarget();
  private master: HTMLMediaElement | null = null;
  private audioUrl: string | null = null;
  private _videoUrl: string | null = null;
  private _duration = 0;

  constructor(readonly monitor: HTMLVideoElement) {
    this.audio.preload = 'auto';
    monitor.preload = 'auto';
    monitor.playsInline = true;
    for (const element of [this.audio, monitor]) {
      element.addEventListener('play', () => this.emit('playstate'));
      element.addEventListener('pause', () => this.emit('playstate'));
      element.addEventListener('seeking', () => {
        if (element === this.master) this.emit('locate');
      });
    }
  }

  get duration(): number {
    return this._duration;
  }

  get videoUrl(): string | null {
    return this._videoUrl;
  }

  get hasMedia(): boolean {
    return this.master !== null;
  }

  get playing(): boolean {
    return this.master !== null && !this.master.paused;
  }

  on(event: TransportEvent, listener: () => void): void {
    this.events.addEventListener(event, listener);
  }

  private emit(event: TransportEvent): void {
    this.events.dispatchEvent(new Event(event));
  }

  async load(audio: Blob | null, video: Blob | null): Promise<void> {
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
    this.master = audio ? this.audio : video ? this.monitor : null;
    if (this.master === this.audio && video) this.videoSync.add(this.monitor);
    this.clock.setSource(this.master);
    try {
      await Promise.all([audio && waitForMetadata(this.audio), video && waitForMetadata(this.monitor)]);
      this._duration = this.master?.duration ?? 0;
    } finally {
      this.emit('load');
    }
  }

  private unload(): void {
    this.videoSync.remove(this.monitor);
    for (const element of [this.audio, this.monitor]) {
      element.removeAttribute('src');
      element.load();
    }
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    if (this._videoUrl) URL.revokeObjectURL(this._videoUrl);
    this.audioUrl = this._videoUrl = null;
    this.master = null;
    this.clock.setSource(null);
    this._duration = 0;
  }

  /** Whether the monitor video's own sound is heard, and how loud. */
  setVideoAudio(enabled: boolean, volume: number): void {
    this.monitor.muted = !enabled;
    this.monitor.volume = Math.min(1, Math.max(0, volume));
  }

  now(): number {
    return Math.min(this.clock.now(), this._duration);
  }

  play(): void {
    if (!this.master) return;
    if (this.master.currentTime >= this._duration) this.master.currentTime = 0;
    void this.master.play().catch(() => {});
  }

  pause(): void {
    this.master?.pause();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(time: number): void {
    if (!this.master) return;
    this.master.currentTime = Math.min(Math.max(time, 0), this._duration);
  }

  skip(delta: number): void {
    this.seek(this.now() + delta);
  }

  /** Call every animation frame: syncs follower videos and returns the current time. */
  tick(): number {
    const time = this.now();
    this.videoSync.tick(time, this.playing);
    return time;
  }
}
