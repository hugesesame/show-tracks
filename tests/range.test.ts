import { describe, expect, it } from 'vitest';
import { moveClip } from '../src/model/clips';
import { createPage } from '../src/model/project';
import { activeOverlap, cueMarkers, inRange, playRange, setOverlap, setRangeEnd, setRangeStart } from '../src/model/range';
import type { Page } from '../src/model/types';

const page = (rangeStart: number | null, rangeEnd: number | null): Page => ({
  ...createPage('p', 'p'),
  audioMediaId: 'a',
  rangeStart,
  rangeEnd,
});

describe('playRange', () => {
  it('is the whole page without in / out points', () => {
    expect(playRange(page(null, null), 100)).toEqual({ start: 0, end: 100 });
  });

  it('keeps the points inside the page', () => {
    expect(playRange(page(10, 60), 100)).toEqual({ start: 10, end: 60 });
    expect(playRange(page(10, 160), 100)).toEqual({ start: 10, end: 100 });
    expect(playRange(page(150, null), 100)).toEqual({ start: 100, end: 100 });
  });
});

describe('inRange / cueMarkers', () => {
  it('includes the in point and excludes the out point', () => {
    const p = page(10, 20);
    expect([9.9, 10, 19.9, 20].map((t) => inRange(p, t))).toEqual([false, true, true, false]);
  });

  it('lists only the markers inside the range', () => {
    const p = {
      ...page(10, 20),
      markers: [5, 10, 15, 20].map((time, i) => ({ id: `m${i}`, name: `Cue ${i + 1}`, time, midiOn: false, note: null, memo: '' })),
    };
    expect(cueMarkers(p).map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('setRangeStart / setRangeEnd', () => {
  it('sets and clears the points', () => {
    expect(setRangeStart(page(null, null), 10, 100).rangeStart).toBe(10);
    expect(setRangeStart(page(10, null), null, 100).rangeStart).toBeNull();
    expect(setRangeEnd(page(null, null), 60, 100).rangeEnd).toBe(60);
    expect(setRangeEnd(page(null, 60), null, 100).rangeEnd).toBeNull();
  });

  it('clears a point moved to the page edge', () => {
    expect(setRangeStart(page(10, null), 0, 100).rangeStart).toBeNull();
    expect(setRangeEnd(page(null, 60), 100, 100).rangeEnd).toBeNull();
  });

  it('clears the other point when they would cross', () => {
    expect(setRangeStart(page(10, 60), 70, 100)).toMatchObject({ rangeStart: 70, rangeEnd: null });
    expect(setRangeEnd(page(10, 60), 5, 100)).toMatchObject({ rangeStart: null, rangeEnd: 5 });
  });

  it('ignores points that leave nothing to play', () => {
    const p = page(10, 60);
    expect(setRangeStart(p, 100, 100)).toBe(p);
    expect(setRangeEnd(p, 0, 100)).toBe(p);
  });
});

describe('moveClip', () => {
  it('moves the in / out points with the audio clip', () => {
    const moved = moveClip(page(10, 60), 'audio', 5, { audio: 100, video: null });
    expect(moved).toMatchObject({ rangeStart: 15, rangeEnd: 65 });
    expect(moveClip(page(null, null), 'audio', 5, { audio: 100, video: null })).toMatchObject({
      rangeStart: null,
      rangeEnd: null,
    });
  });
});

describe('overlap mark', () => {
  it('works only inside the range, before the out point', () => {
    const at = (overlapAt: number) => ({ ...page(10, 60), overlapAt });
    expect(activeOverlap(at(50), 100)).toBe(50);
    expect(activeOverlap(at(5), 100)).toBeNull();
    expect(activeOverlap(at(60), 100)).toBeNull();
    expect(activeOverlap(page(null, null), 100)).toBeNull();
  });

  it('is placed within the page and moves with the audio clip', () => {
    expect(setOverlap(page(null, null), 120, 100).overlapAt).toBe(100);
    expect(setOverlap({ ...page(null, null), overlapAt: 40 }, null, 100).overlapAt).toBeNull();
    const moved = moveClip({ ...page(null, null), overlapAt: 40 }, 'audio', 5, { audio: 100, video: null });
    expect(moved.overlapAt).toBe(45);
  });
});
