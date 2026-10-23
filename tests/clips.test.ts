import { describe, expect, it } from 'vitest';
import { moveClip, pageDuration } from '../src/model/clips';
import { addMarker } from '../src/model/markers';
import { createPage, normalizeProject } from '../src/model/project';
import type { Page } from '../src/model/types';

const durations = { audio: 60, video: 30 };

const pageWithMarkers = (...times: number[]): Page => {
  let page: Page = { ...createPage('P', 'p'), audioMediaId: 'a', videoMediaId: 'v' };
  times.forEach((t, i) => {
    page = addMarker(page, t, 1000, () => `m${i + 1}`).page;
  });
  return page;
};

describe('pageDuration', () => {
  it('ends with the clip that ends last', () => {
    const page = { ...pageWithMarkers(), audioOffset: 5, videoOffset: 50 };
    expect(pageDuration(page, durations)).toBe(80);
    expect(pageDuration({ ...page, videoMediaId: null }, durations)).toBe(65);
  });

  it('is zero without media', () => {
    expect(pageDuration(createPage('P'), { audio: null, video: null })).toBe(0);
  });
});

describe('moveClip', () => {
  it('moves the audio clip and shifts the markers with it', () => {
    const page = moveClip(pageWithMarkers(10, 20), 'audio', 5, durations);
    expect(page.audioOffset).toBe(5);
    expect(page.markers.map((m) => m.time)).toEqual([15, 25]);
  });

  it('does not move markers with the video clip', () => {
    const page = moveClip(pageWithMarkers(10), 'video', 12, durations);
    expect(page.videoOffset).toBe(12);
    expect(page.markers[0].time).toBe(10);
  });

  it('keeps clips at or after zero, clamping the marker shift too', () => {
    let page = moveClip(pageWithMarkers(10), 'audio', 4, durations);
    page = moveClip(page, 'audio', -20, durations);
    expect(page.audioOffset).toBe(0);
    expect(page.markers[0].time).toBe(10);
  });

  it('keeps shifted markers within the page', () => {
    // A marker in the video tail beyond the audio, while the video sets the page end.
    const page = { ...pageWithMarkers(55), videoOffset: 40 }; // page ends at 70
    const moved = moveClip(page, 'audio', 0.5, { audio: 50, video: 30 });
    expect(moved.markers[0].time).toBe(55.5);
    const far = moveClip(page, 'audio', 0, { audio: 50, video: 30 });
    expect(far.markers[0].time).toBe(55);
  });
});

describe('normalizeProject', () => {
  it('fills in clip offsets for projects saved before they existed', () => {
    const legacy = createPage('Old', 'old') as Partial<Page>;
    delete legacy.audioOffset;
    delete legacy.videoOffset;
    delete legacy.audioVolume;
    delete legacy.audioMuted;
    delete legacy.endAction;
    const project = normalizeProject({
      pages: [legacy as Page],
      currentPageId: 'old',
      settings: { mtcFps: '30', midiOutputId: null, loopPages: false, masterVolume: 1, masterMuted: false, masterPan: 0, noteChannel: 1, noteNumber: 60, noteVelocity: 127, memoSize: 8, memoColor: '#ffffff', memoOutline: 0.08, memoOutlineColor: '#000000', memoPosition: 'bottom', memoFade: 0.5, memoFadeOn: true, memoOutput: true },
    });
    expect(project.pages[0].audioOffset).toBe(0);
    expect(project.pages[0].videoOffset).toBe(0);
    expect(project.pages[0].audioVolume).toBe(1);
    expect(project.pages[0].audioMuted).toBe(false);
    expect(project.pages[0].endAction).toBe('stop');
  });
});
