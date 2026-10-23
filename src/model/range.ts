import type { Marker, Page } from './types';

/** The part of the page that plays, in seconds on the page timeline. */
export type PlayRange = { start: number; end: number };

type RangePoints = Pick<Page, 'rangeStart' | 'rangeEnd'>;

/** The page's in / out points within its length; unset points are the page's start and end. */
export function playRange(page: RangePoints, duration: number): PlayRange {
  const start = Math.min(Math.max(page.rangeStart ?? 0, 0), duration);
  const end = Math.min(Math.max(page.rangeEnd ?? duration, start), duration);
  return { start, end };
}

/** Whether a time is inside the range. A cue on the out point is outside: it would end at once. */
export function inRange(page: RangePoints, time: number): boolean {
  return (page.rangeStart === null || time >= page.rangeStart) && (page.rangeEnd === null || time < page.rangeEnd);
}

/** The markers GO steps through. */
export function cueMarkers(page: Page): Marker[] {
  return page.markers.filter((m) => inRange(page, m.time));
}

/** Sets the in point (null clears it). The page start clears it, and an out point at or before it is cleared. */
export function setRangeStart(page: Page, time: number | null, duration: number): Page {
  if (time === null || time <= 0) return { ...page, rangeStart: null };
  // An in point at the very end would leave nothing to play.
  if (time >= duration) return page;
  const start = time;
  const rangeEnd = page.rangeEnd !== null && page.rangeEnd <= start ? null : page.rangeEnd;
  return { ...page, rangeStart: start, rangeEnd };
}

/** Sets the out point (null clears it). The page end clears it, and an in point at or after it is cleared. */
export function setRangeEnd(page: Page, time: number | null, duration: number): Page {
  if (time === null || time >= duration) return { ...page, rangeEnd: null };
  if (time <= 0) return page;
  const end = time;
  const rangeStart = page.rangeStart !== null && page.rangeStart >= end ? null : page.rangeStart;
  return { ...page, rangeStart, rangeEnd: end };
}
