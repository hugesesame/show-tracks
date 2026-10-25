import { describe, expect, it } from 'vitest';
import { addPage, createPage, createProject, updateSettings } from '../src/model/project';
import { playListTime } from '../src/model/runningTime';
import type { Page } from '../src/model/types';

const durations: Record<string, number> = { song1: 200, song2: 180, clip: 240 };
const durationOf = (id: string) => durations[id] ?? null;

const project = (...pages: Page[]) => pages.slice(1).reduce(addPage, createProject(pages[0]));
const page = (id: string, patch: Partial<Page> = {}): Page => ({ ...createPage(id, id), ...patch });

describe('playListTime', () => {
  it('adds up the pages, each from its in point to its out point', () => {
    const p = project(page('a', { audioMediaId: 'song1' }), page('b', { audioMediaId: 'song2', rangeStart: 10, rangeEnd: 100 }));
    expect(playListTime(p, durationOf)).toEqual({ seconds: 200 + 90, unknown: false });
  });

  it('counts a page up to its overlap mark when a next page starts there', () => {
    const p = project(page('a', { audioMediaId: 'song1', overlapAt: 190 }), page('b', { audioMediaId: 'song2', overlapAt: 170 }));
    // The last page has no next page, so it plays to its end.
    expect(playListTime(p, durationOf).seconds).toBe(190 + 180);
    // Looping the pages, the last page hands over to the first.
    expect(playListTime(updateSettings(p, { loopPages: true }), durationOf).seconds).toBe(190 + 170);
  });

  it('uses the clips placed on the page and the blank length without media', () => {
    const p = project(page('a', { audioMediaId: 'song1', videoMediaId: 'clip', videoOffset: 5 }), page('b', { blankLength: 60 }));
    expect(playListTime(p, durationOf).seconds).toBe(245 + 60);
  });

  it('leaves out the MTC In pages', () => {
    const p = project(page('a', { audioMediaId: 'song1' }), page('b', { followMtc: true, blankLength: 600 }));
    expect(playListTime(p, durationOf).seconds).toBe(200);
  });

  it('marks the time unknown when media is missing', () => {
    const p = project(page('a', { audioMediaId: 'song1' }), page('b', { audioMediaId: 'gone' }));
    expect(playListTime(p, durationOf)).toEqual({ seconds: 200, unknown: true });
  });
});
