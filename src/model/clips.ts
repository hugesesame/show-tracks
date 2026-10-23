import type { Page } from './types';

/** Lengths of the page's media in seconds; null when the page has none of that kind. */
export type MediaDurations = { audio: number | null; video: number | null };

/** The page ends where its last clip ends. */
export function pageDuration(
  page: Pick<Page, 'audioMediaId' | 'videoMediaId' | 'audioOffset' | 'videoOffset'>,
  durations: MediaDurations,
): number {
  const audioEnd = page.audioMediaId && durations.audio !== null ? page.audioOffset + durations.audio : 0;
  const videoEnd = page.videoMediaId && durations.video !== null ? page.videoOffset + durations.video : 0;
  return Math.max(audioEnd, videoEnd);
}

/**
 * Places a clip on the page timeline (never before zero).
 * Markers and the in / out points belong to the music, so they move with the audio clip.
 */
export function moveClip(page: Page, kind: 'audio' | 'video', offset: number, durations: MediaDurations): Page {
  const clamped = Math.max(0, offset);
  if (kind === 'video') return { ...page, videoOffset: clamped };

  const delta = clamped - page.audioOffset;
  const moved = { ...page, audioOffset: clamped };
  const end = pageDuration(moved, durations);
  const shift = (time: number) => Math.min(Math.max(time + delta, 0), end);
  return {
    ...moved,
    markers: page.markers.map((m) => ({ ...m, time: shift(m.time) })),
    rangeStart: page.rangeStart === null ? null : shift(page.rangeStart),
    rangeEnd: page.rangeEnd === null ? null : shift(page.rangeEnd),
  };
}
