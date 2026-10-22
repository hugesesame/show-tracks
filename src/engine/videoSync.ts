const SEEK_THRESHOLD = 0.2;
const IGNORE_THRESHOLD = 0.01;
const STOPPED_THRESHOLD = 0.02;
const MAX_RATE_DEVIATION = 0.05;

/** How to bring a follower video back in line with the master time. */
export function videoCorrection(
  videoTime: number,
  masterTime: number,
  playing: boolean,
): { seekTo: number | null; rate: number } {
  const drift = videoTime - masterTime;
  if (!playing) {
    return { seekTo: Math.abs(drift) > STOPPED_THRESHOLD ? masterTime : null, rate: 1 };
  }
  if (Math.abs(drift) > SEEK_THRESHOLD) return { seekTo: masterTime, rate: 1 };
  if (Math.abs(drift) < IGNORE_THRESHOLD) return { seekTo: null, rate: 1 };
  // Catch up over about two seconds.
  const rate = 1 - drift / 2;
  return { seekTo: null, rate: Math.min(1 + MAX_RATE_DEVIATION, Math.max(1 - MAX_RATE_DEVIATION, rate)) };
}

/** Keeps follower videos (monitor, output window) in line with the master clock. */
export class VideoSync {
  private readonly followers = new Set<HTMLVideoElement>();

  add(video: HTMLVideoElement): void {
    video.preservesPitch = true;
    this.followers.add(video);
  }

  remove(video: HTMLVideoElement): void {
    this.followers.delete(video);
  }

  /**
   * `clipTime` is the position inside the video file, which is negative
   * before the clip starts. Outside the clip the videos are hidden (black).
   */
  tick(clipTime: number, playing: boolean): void {
    for (const video of this.followers) {
      if (!video.src || video.readyState === HTMLMediaElement.HAVE_NOTHING) continue;
      const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
      const inClip = clipTime >= 0 && clipTime < duration;
      video.style.visibility = inClip ? '' : 'hidden';
      const target = Math.min(Math.max(clipTime, 0), duration);
      const shouldPlay = playing && inClip;

      if (shouldPlay && video.paused) void video.play().catch(() => {});
      if (!shouldPlay && !video.paused) video.pause();

      const { seekTo, rate } = videoCorrection(video.currentTime, target, shouldPlay);
      if (seekTo !== null && !video.seeking) video.currentTime = seekTo;
      if (video.playbackRate !== rate) video.playbackRate = rate;
    }
  }
}
