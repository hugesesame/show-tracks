import { pageDuration } from './clips';
import { nextPage, pagesOfKind } from './project';
import { activeOverlap, playRange } from './range';
import type { Page, Project } from './types';

/** How long the Play list takes; `unknown` when some media is missing, so its length is left out. */
export type RunningTime = { seconds: number; unknown: boolean };

/**
 * How long one page plays: from its in point to its out point, or to its
 * overlap mark when a next page starts there. Without media it is a blank track.
 * Null when its media is missing.
 */
export function pagePlayTime(project: Project, page: Page, durationOf: (mediaId: string) => number | null): number | null {
  const audio = page.audioMediaId ? durationOf(page.audioMediaId) : null;
  const video = page.videoMediaId ? durationOf(page.videoMediaId) : null;
  if ((page.audioMediaId && audio === null) || (page.videoMediaId && video === null)) return null;
  const length = page.audioMediaId || page.videoMediaId ? pageDuration(page, { audio, video }) : page.blankLength;
  const { start, end } = playRange(page, length);
  const overlap = activeOverlap(page, length);
  return (overlap !== null && nextPage(project, page.id) ? overlap : end) - start;
}

/** The running time of the Play list, played through once. */
export function playListTime(project: Project, durationOf: (mediaId: string) => number | null): RunningTime {
  let seconds = 0;
  let unknown = false;
  for (const page of pagesOfKind(project, 'play')) {
    const time = pagePlayTime(project, page, durationOf);
    if (time === null) unknown = true;
    else seconds += time;
  }
  return { seconds, unknown };
}
