import { describe, expect, it } from 'vitest';
import { MtcInput } from '../src/engine/mtcInput';
import { fullFrame, quarterFrames } from '../src/engine/mtcMessages';
import { timecodeToSeconds, type Fps, type Timecode } from '../src/engine/timecode';

/** Sends one quarter frame cycle, a quarter frame apart, starting at `startMs`; returns when it ended. */
function sendCycle(input: MtcInput, tc: Timecode, fps: Fps, startMs: number): number {
  const quarterMs = 1000 / 30 / 4;
  quarterFrames(tc, fps).forEach((piece, i) => input.read(new Uint8Array(piece), startMs + i * quarterMs));
  return startMs + 7 * quarterMs;
}

describe('MtcInput', () => {
  it('waits until MTC comes in', () => {
    expect(new MtcInput().now(0)).toEqual({ seconds: 0, state: 'waiting' });
  });

  it('reads a Full Frame as a stopped position', () => {
    const input = new MtcInput();
    input.read(new Uint8Array(fullFrame({ h: 1, m: 0, s: 10, f: 15 }, '30')), 0);
    expect(input.now(500)).toEqual({ seconds: 3610.5, state: 'stopped' });
    expect(input.fps).toBe('30');
  });

  it('runs from a complete quarter frame cycle, counting the time the cycle took', () => {
    const input = new MtcInput();
    const tc = { h: 1, m: 0, s: 0, f: 0 };
    const end = sendCycle(input, tc, '30', 1000);
    const { seconds, state } = input.now(end);
    expect(state).toBe('running');
    expect(seconds).toBeCloseTo(timecodeToSeconds(tc, '30') + 1.75 / 30, 6);
    // Between cycles the time runs on.
    expect(input.now(end + 40).seconds).toBeCloseTo(seconds + 0.04, 6);
  });

  it('reads the rate and hours from the last piece', () => {
    const input = new MtcInput();
    const tc = { h: 17, m: 42, s: 35, f: 27 };
    const end = sendCycle(input, tc, '29.97df', 0);
    expect(input.fps).toBe('29.97df');
    expect(input.now(end).seconds).toBeCloseTo(timecodeToSeconds(tc, '29.97df') + 1.75 / (30000 / 1001), 6);
  });

  it('ignores a cycle that starts in the middle', () => {
    const input = new MtcInput();
    quarterFrames({ h: 1, m: 2, s: 3, f: 4 }, '25').slice(3).forEach((p) => input.read(new Uint8Array(p), 0));
    expect(input.now(0).state).toBe('waiting');
  });

  it('counts as stopped when the frames stop coming', () => {
    const input = new MtcInput();
    const end = sendCycle(input, { h: 0, m: 0, s: 5, f: 0 }, '30', 0);
    const at = input.now(end).seconds;
    expect(input.now(end + 150).state).toBe('running');
    expect(input.now(end + 250)).toEqual({ seconds: at, state: 'stopped' });
  });

  it('ignores other MIDI', () => {
    const input = new MtcInput();
    input.read(new Uint8Array([0x90, 60, 127]), 0);
    expect(input.now(0).state).toBe('waiting');
  });
});
