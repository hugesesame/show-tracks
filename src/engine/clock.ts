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

/** Small backward steps from the audio (e.g. its start latency) are held instead of followed. */
const HOLD_THRESHOLD = 0.1;

/**
 * The page timeline clock. While the audio clip is playing it follows the
 * audio, so the music is never corrected; elsewhere it runs on real time.
 */
export class PageClock {
  private playing = false;
  private anchorTime = 0;
  private anchorMs = 0;
  private last = 0;

  start(time: number, nowMs: number): void {
    this.playing = true;
    this.set(time, nowMs);
  }

  stop(time: number): void {
    this.playing = false;
    this.anchorTime = this.last = time;
  }

  set(time: number, nowMs: number): void {
    this.anchorTime = this.last = time;
    this.anchorMs = nowMs;
  }

  /** `audioPageTime` is the page time read from the playing audio, or null when it is not playing. */
  now(nowMs: number, audioPageTime: number | null): number {
    if (!this.playing) return this.anchorTime;
    let time = this.anchorTime + (nowMs - this.anchorMs) / 1000;
    if (audioPageTime !== null) {
      const behind = this.last - audioPageTime;
      time = behind > 0 && behind < HOLD_THRESHOLD ? this.last : audioPageTime;
    }
    this.set(time, nowMs);
    return time;
  }
}
