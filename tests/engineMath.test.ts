import { describe, expect, it } from 'vitest';
import { ClockInterpolator, PageClock } from '../src/engine/clock';
import { computePeaks, PEAK_PAIRS_PER_SECOND } from '../src/media/peaks';
import { videoCorrection } from '../src/engine/videoSync';

describe('computePeaks', () => {
  it('stores min/max pairs per bucket across all channels', () => {
    const sampleRate = PEAK_PAIRS_PER_SECOND * 4; // 4 samples per bucket
    const left = new Float32Array([0, 0.5, -0.25, 0, 0.25, 0.25, 0.25, 0.25, 1]);
    const right = new Float32Array([0, 0, -0.75, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(computePeaks([left, right], sampleRate))).toEqual([
      -0.75, 0.5, 0, 0.25, 0, 1,
    ]);
  });
});

describe('ClockInterpolator', () => {
  it('extrapolates between coarse media time updates while playing', () => {
    const clock = new ClockInterpolator();
    expect(clock.update(10, true, 1000)).toBeCloseTo(10);
    // The media element still reports 10, but 16ms of real time have passed.
    expect(clock.update(10, true, 1016)).toBeCloseTo(10.016);
    expect(clock.update(10.03, true, 1032)).toBeCloseTo(10.032);
  });

  it('re-anchors on large jumps (seek) and when paused', () => {
    const clock = new ClockInterpolator();
    clock.update(10, true, 1000);
    expect(clock.update(42, true, 1016)).toBe(42);
    expect(clock.update(43, false, 5000)).toBe(43);
    expect(clock.update(43, false, 6000)).toBe(43);
  });

  it('never runs backwards while playing', () => {
    const clock = new ClockInterpolator();
    clock.update(10, true, 1000);
    const ahead = clock.update(10, true, 1040);
    expect(clock.update(10.02, true, 1041)).toBeGreaterThanOrEqual(ahead);
  });
});

describe('videoCorrection', () => {
  it('seeks when the drift is large', () => {
    expect(videoCorrection(10.5, 10, true)).toEqual({ seekTo: 10, rate: 1 });
  });

  it('nudges the playback rate for small drift', () => {
    const behind = videoCorrection(9.9, 10, true);
    expect(behind.seekTo).toBeNull();
    expect(behind.rate).toBeGreaterThan(1);
    expect(behind.rate).toBeLessThanOrEqual(1.05);
    expect(videoCorrection(10.1, 10, true).rate).toBeLessThan(1);
  });

  it('ignores tiny drift', () => {
    expect(videoCorrection(10.005, 10, true)).toEqual({ seekTo: null, rate: 1 });
  });

  it('snaps exactly to the master time when stopped', () => {
    expect(videoCorrection(10.05, 10, false)).toEqual({ seekTo: 10, rate: 1 });
    expect(videoCorrection(10.001, 10, false)).toEqual({ seekTo: null, rate: 1 });
  });
});

describe('PageClock', () => {
  it('holds its time while stopped', () => {
    const clock = new PageClock();
    clock.set(12, 0);
    expect(clock.now(5000, null)).toBe(12);
  });

  it('runs on real time when no audio is locked', () => {
    const clock = new PageClock();
    clock.start(2, 1000);
    expect(clock.now(1500, null)).toBeCloseTo(2.5);
  });

  it('follows the audio while it is locked, then continues from there', () => {
    const clock = new PageClock();
    clock.start(0, 0);
    expect(clock.now(1000, 0.98)).toBeCloseTo(0.98);
    expect(clock.now(1500, null)).toBeCloseTo(1.48);
  });

  it('does not step backwards when the audio starts slightly late', () => {
    const clock = new PageClock();
    clock.start(5, 0);
    expect(clock.now(100, null)).toBeCloseTo(5.1);
    expect(clock.now(116, 5.08)).toBeCloseTo(5.1);
    expect(clock.now(132, 5.13)).toBeCloseTo(5.13);
  });

  it('jumps on seek', () => {
    const clock = new PageClock();
    clock.start(5, 0);
    clock.set(30, 100);
    expect(clock.now(100, null)).toBe(30);
  });
});
