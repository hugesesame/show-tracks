import { describe, expect, it } from 'vitest';
import {
  FPS_OPTIONS,
  formatTimecode,
  framesToTimecode,
  parseTimecode,
  secondsToTimecode,
  timecodeToFrames,
  timecodeToSeconds,
  type Timecode,
} from '../src/engine/timecode';

const tc = (h: number, m: number, s: number, f: number): Timecode => ({ h, m, s, f });

describe('secondsToTimecode', () => {
  it('converts whole seconds for non-drop rates', () => {
    expect(secondsToTimecode(0, '30')).toEqual(tc(0, 0, 0, 0));
    expect(secondsToTimecode(61.5, '30')).toEqual(tc(0, 1, 1, 15));
    expect(secondsToTimecode(3600 + 0.5, '25')).toEqual(tc(1, 0, 0, 12));
    expect(secondsToTimecode(10.25, '24')).toEqual(tc(0, 0, 10, 6));
  });

  it('applies an offset in seconds', () => {
    expect(secondsToTimecode(1, '30', 7200)).toEqual(tc(2, 0, 1, 0));
  });

  it('wraps at 24 hours', () => {
    expect(secondsToTimecode(86400 + 1, '25')).toEqual(tc(0, 0, 1, 0));
  });

  it('does not lose a frame to floating point error', () => {
    expect(secondsToTimecode(0.1 + 0.2, '30')).toEqual(tc(0, 0, 0, 9));
  });
});

describe('29.97 drop frame', () => {
  it('skips frames 00 and 01 at the start of each minute', () => {
    expect(framesToTimecode(1799, '29.97df')).toEqual(tc(0, 0, 59, 29));
    expect(framesToTimecode(1800, '29.97df')).toEqual(tc(0, 1, 0, 2));
  });

  it('does not skip frames on every tenth minute', () => {
    expect(framesToTimecode(17981, '29.97df')).toEqual(tc(0, 9, 59, 29));
    expect(framesToTimecode(17982, '29.97df')).toEqual(tc(0, 10, 0, 0));
  });

  it('round-trips frames through timecode', () => {
    for (const frames of [0, 1, 1799, 1800, 17981, 17982, 107892, 107893]) {
      expect(timecodeToFrames(framesToTimecode(frames, '29.97df'), '29.97df')).toBe(frames);
    }
  });

  it('matches wall clock: one hour of real time is 01:00:00;00', () => {
    expect(secondsToTimecode(3600, '29.97df')).toEqual(tc(1, 0, 0, 0));
  });
});

describe('round trip for every rate', () => {
  it.each(FPS_OPTIONS)('%s', (fps) => {
    for (const frames of [0, 1, 29, 1000, 54321, 200000]) {
      const t = framesToTimecode(frames, fps);
      expect(timecodeToFrames(t, fps)).toBe(frames);
    }
  });
});

describe('timecodeToSeconds', () => {
  it('converts back to seconds', () => {
    expect(timecodeToSeconds(tc(0, 1, 1, 15), '30')).toBeCloseTo(61.5);
    expect(timecodeToSeconds(tc(1, 0, 0, 0), '29.97df')).toBeCloseTo(3600, 2);
  });
});

describe('formatTimecode / parseTimecode', () => {
  it('formats with a colon, or a semicolon before frames for drop frame', () => {
    expect(formatTimecode(tc(1, 2, 3, 4), '30')).toBe('01:02:03:04');
    expect(formatTimecode(tc(1, 2, 3, 4), '29.97df')).toBe('01:02:03;04');
  });

  it('parses either separator', () => {
    expect(parseTimecode('02:00:00:00', '30')).toEqual(tc(2, 0, 0, 0));
    expect(parseTimecode('00:01:00;02', '29.97df')).toEqual(tc(0, 1, 0, 2));
  });

  it('rejects malformed or out-of-range input', () => {
    expect(parseTimecode('1:2:3', '30')).toBeNull();
    expect(parseTimecode('00:60:00:00', '30')).toBeNull();
    expect(parseTimecode('00:00:00:25', '25')).toBeNull();
    expect(parseTimecode('00:01:00;00', '29.97df')).toBeNull();
  });
});
