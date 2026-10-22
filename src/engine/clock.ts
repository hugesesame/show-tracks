/** Drift beyond which the media time is trusted outright (a seek or a stall). */
const REANCHOR_THRESHOLD = 0.1;

/**
 * Media elements update currentTime coarsely. This smooths it with the
 * real-time clock while playing, without ever running backwards.
 */
export class ClockInterpolator {
  private anchorMedia = 0;
  private anchorReal = 0;
  private last = 0;
  private wasPlaying = false;

  update(mediaTime: number, playing: boolean, realMs: number): number {
    if (!playing) {
      this.wasPlaying = false;
      return this.reanchor(mediaTime, realMs);
    }
    if (!this.wasPlaying) {
      this.wasPlaying = true;
      return this.reanchor(mediaTime, realMs);
    }
    const estimate = this.anchorMedia + (realMs - this.anchorReal) / 1000;
    if (Math.abs(mediaTime - estimate) > REANCHOR_THRESHOLD) return this.reanchor(mediaTime, realMs);
    // Ease towards fresh media readings, but stay monotonic.
    if (mediaTime !== this.anchorMedia && mediaTime > estimate) {
      this.anchorMedia = mediaTime;
      this.anchorReal = realMs;
    }
    this.last = Math.max(this.last, this.anchorMedia + (realMs - this.anchorReal) / 1000);
    return this.last;
  }

  private reanchor(mediaTime: number, realMs: number): number {
    this.anchorMedia = mediaTime;
    this.anchorReal = realMs;
    this.last = mediaTime;
    return mediaTime;
  }
}

/** The current time of the page, driven by its master media element. */
export class MediaClock {
  private source: HTMLMediaElement | null = null;
  private readonly interpolator = new ClockInterpolator();

  setSource(element: HTMLMediaElement | null): void {
    this.source = element;
  }

  now(): number {
    if (!this.source) return 0;
    return this.interpolator.update(this.source.currentTime, !this.source.paused, performance.now());
  }
}
