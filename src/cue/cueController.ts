import { nextPage } from '../model/project';
import { cueMarkers, inRange } from '../model/range';
import type { Marker, Page, Project } from '../model/types';

export type Standby =
  | { kind: 'cue'; markerId: string }
  /** A page without markers in its range: GO plays it from the in point. */
  | { kind: 'pageStart' }
  | { kind: 'nextPage' }
  | { kind: 'none' };

export type CueState = { pageId: string; standby: Standby };

export type GoAction =
  | { kind: 'seekAndPlay'; time: number }
  | { kind: 'loadPageAndPlay'; pageId: string; time: number }
  | { kind: 'none' };

const findPage = (project: Project, pageId: string) => project.pages.find((p) => p.id === pageId);

function firstStandby(page: Page): Standby {
  const [first] = cueMarkers(page);
  return first ? { kind: 'cue', markerId: first.id } : { kind: 'pageStart' };
}

function afterLast(project: Project, pageId: string): Standby {
  return nextPage(project, pageId) ? { kind: 'nextPage' } : { kind: 'none' };
}

/** GO skips markers outside the page's range. */
function standbyAfterIndex(project: Project, page: Page, index: number): Standby {
  const next = page.markers.slice(index + 1).find((m) => inRange(page, m.time));
  return next ? { kind: 'cue', markerId: next.id } : afterLast(project, page.id);
}

export function initialCueState(project: Project, pageId: string): CueState {
  const page = findPage(project, pageId);
  return { pageId, standby: page ? firstStandby(page) : { kind: 'none' } };
}

/** Fires the standby within the current page. Returns null if it is not a cue on this page. */
function fireInPage(project: Project, page: Page, standby: Standby): { time: number; standby: Standby } | null {
  if (standby.kind === 'pageStart') return { time: page.rangeStart ?? 0, standby: afterLast(project, page.id) };
  if (standby.kind !== 'cue') return null;
  const index = page.markers.findIndex((m) => m.id === standby.markerId);
  if (index < 0) return null;
  return { time: page.markers[index].time, standby: standbyAfterIndex(project, page, index) };
}

export function go(project: Project, state: CueState): { state: CueState; action: GoAction } {
  const page = findPage(project, state.pageId);
  if (!page) return { state, action: { kind: 'none' } };

  if (state.standby.kind === 'nextPage') {
    const next = nextPage(project, page.id);
    if (!next) return { state: { ...state, standby: { kind: 'none' } }, action: { kind: 'none' } };
    const fired = fireInPage(project, next, firstStandby(next));
    if (!fired) return { state, action: { kind: 'none' } };
    return {
      state: { pageId: next.id, standby: fired.standby },
      action: { kind: 'loadPageAndPlay', pageId: next.id, time: fired.time },
    };
  }

  const fired = fireInPage(project, page, state.standby);
  if (!fired) return { state, action: { kind: 'none' } };
  return { state: { ...state, standby: fired.standby }, action: { kind: 'seekAndPlay', time: fired.time } };
}

export function select(state: CueState, markerId: string): CueState {
  return { ...state, standby: { kind: 'cue', markerId } };
}

/**
 * Keeps the standby valid after the project changed.
 * `previousMarkers` are the current page's markers before the change.
 */
export function reconcile(project: Project, state: CueState, previousMarkers: Marker[]): CueState {
  if (project.currentPageId !== state.pageId) return initialCueState(project, project.currentPageId);
  const page = findPage(project, state.pageId);
  if (!page) return initialCueState(project, project.currentPageId);

  const { standby } = state;
  const cues = cueMarkers(page);
  if (standby.kind === 'pageStart') return { ...state, standby: firstStandby(page) };
  // A marker picked by hand stays on standby even outside the range.
  if (standby.kind !== 'cue' || page.markers.some((m) => m.id === standby.markerId)) return state;
  if (cues.length === 0) return { ...state, standby: { kind: 'pageStart' } };

  // The standby marker was removed: stand by on the first surviving cue that followed it.
  const removedIndex = previousMarkers.findIndex((m) => m.id === standby.markerId);
  const survivor = previousMarkers.slice(removedIndex + 1).find((m) => cues.some((c) => c.id === m.id));
  return { ...state, standby: survivor ? { kind: 'cue', markerId: survivor.id } : afterLast(project, page.id) };
}

/** Playback passed a cue: stand by on the one after it, so GO carries on from there. */
export function passed(project: Project, state: CueState, markerId: string): CueState {
  const page = findPage(project, state.pageId);
  const index = page ? page.markers.findIndex((m) => m.id === markerId) : -1;
  if (!page || index < 0) return state;
  return { ...state, standby: standbyAfterIndex(project, page, index) };
}
