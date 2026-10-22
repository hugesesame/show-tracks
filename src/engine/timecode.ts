export type Fps = '24' | '25' | '29.97df' | '30';

export const FPS_OPTIONS: readonly Fps[] = ['24', '25', '29.97df', '30'];

export type Timecode = { h: number; m: number; s: number; f: number };

/** Frames per second as counted in the timecode (nominal). */
export function nominalFps(fps: Fps): number {
  return fps === '29.97df' ? 30 : Number(fps);
}

/** Real frames per second of wall-clock time. */
export function realFps(fps: Fps): number {
  return fps === '29.97df' ? 30000 / 1001 : Number(fps);
}

const DAY_SECONDS = 24 * 60 * 60;
// 29.97 drop frame: frames per minute and per ten minutes after dropping.
const DF_FRAMES_PER_MINUTE = 30 * 60 - 2;
const DF_FRAMES_PER_10_MINUTES = DF_FRAMES_PER_MINUTE * 10 + 2;

function framesPerDay(fps: Fps): number {
  return fps === '29.97df' ? DF_FRAMES_PER_10_MINUTES * 6 * 24 : nominalFps(fps) * DAY_SECONDS;
}

export function secondsToFrames(seconds: number, fps: Fps): number {
  // The epsilon absorbs floating point error such as 0.3 * 30 = 8.999999.
  return Math.floor(seconds * realFps(fps) + 1e-6);
}

export function framesToTimecode(frames: number, fps: Fps): Timecode {
  const perDay = framesPerDay(fps);
  let n = ((frames % perDay) + perDay) % perDay;
  const base = nominalFps(fps);

  if (fps === '29.97df') {
    // Re-insert the dropped frame numbers so n counts like 30 fps non-drop.
    const tens = Math.floor(n / DF_FRAMES_PER_10_MINUTES);
    const rem = n % DF_FRAMES_PER_10_MINUTES;
    n += 18 * tens + (rem > 1 ? 2 * Math.floor((rem - 2) / DF_FRAMES_PER_MINUTE) : 0);
  }

  return {
    h: Math.floor(n / (base * 3600)),
    m: Math.floor(n / (base * 60)) % 60,
    s: Math.floor(n / base) % 60,
    f: n % base,
  };
}

export function timecodeToFrames(tc: Timecode, fps: Fps): number {
  const base = nominalFps(fps);
  const frames = ((tc.h * 60 + tc.m) * 60 + tc.s) * base + tc.f;
  if (fps !== '29.97df') return frames;
  const totalMinutes = tc.h * 60 + tc.m;
  return frames - 2 * (totalMinutes - Math.floor(totalMinutes / 10));
}

export function secondsToTimecode(seconds: number, fps: Fps, offsetSeconds = 0): Timecode {
  return framesToTimecode(secondsToFrames(seconds + offsetSeconds, fps), fps);
}

export function timecodeToSeconds(tc: Timecode, fps: Fps): number {
  return timecodeToFrames(tc, fps) / realFps(fps);
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTimecode(tc: Timecode, fps: Fps): string {
  const sep = fps === '29.97df' ? ';' : ':';
  return `${pad(tc.h)}:${pad(tc.m)}:${pad(tc.s)}${sep}${pad(tc.f)}`;
}

/** Parses "hh:mm:ss:ff" (or "hh:mm:ss;ff"). Returns null if malformed or out of range. */
export function parseTimecode(text: string, fps: Fps): Timecode | null {
  const match = /^(\d{2}):(\d{2}):(\d{2})[:;](\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [h, m, s, f] = match.slice(1).map(Number);
  if (h > 23 || m > 59 || s > 59 || f >= nominalFps(fps)) return null;
  if (fps === '29.97df' && s === 0 && f < 2 && m % 10 !== 0) return null;
  return { h, m, s, f };
}
