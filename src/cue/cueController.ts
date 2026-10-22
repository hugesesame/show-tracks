import type { Marker, Page, Project } from '../model/types';

export type Standby =
  | { kind: 'cue'; markerId: string }
  /** A page without markers: GO plays it from the start. */
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
  return page.markers.length > 0 ? { kind: 'cue', markerId: page.markers[0].id } : { kind: 'pageStart' };
}

function afterLast(project: Project, pageId: string): Standby {
  const index = project.pages.findIndex((p) => p.id === pageId);
  return index >= 0 && index < project.pages.length - 1 ? { kind: 'nextPage' } : { kind: 'none' };
}

function standbyAfterIndex(project: Project, page: Page, index: number): Standby {
  const next = page.markers[index + 1];
  return next ? { kind: 'cue', markerId: next.id } : afterLast(project, page.id);
}

export function initialCueState(project: Project, pageId: string): CueState {
  const page = findPage(project, pageId);
  return { pageId, standby: page ? firstStandby(page) : { kind: 'none' } };
}

/** Fires the standby within the current page. Returns null if it is not a cue on this page. */
function fireInPage(project: Project, page: Page, standby: Standby): { time: number; standby: Standby } | null {
  if (standby.kind === 'pageStart') return { time: 0, standby: afterLast(project, page.id) };
  if (standby.kind !== 'cue') return null;
  const index = page.markers.findIndex((m) => m.id === standby.markerId);
  if (index < 0) return null;
  return { time: page.markers[index].time, standby: standbyAfterIndex(project, page, index) };
}

export function go(project: Project, state: CueState): { state: CueState; action: GoAction } {
  const page = findPage(project, state.pageId);
  if (!page) return { state, action: { kind: 'none' } };

  if (state.standby.kind === 'nextPage') {
    const index = project.pages.findIndex((p) => p.id === page.id);
    const nextPage = project.pages[index + 1];
    if (!nextPage) return { state: { ...state, standby: { kind: 'none' } }, action: { kind: 'none' } };
    const fired = fireInPage(project, nextPage, firstStandby(nextPage));
    if (!fired) return { state, action: { kind: 'none' } };
    return {
      state: { pageId: nextPage.id, standby: fired.standby },
      action: { kind: 'loadPageAndPlay', pageId: nextPage.id, time: fired.time },
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
  if (page.markers.length === 0) {
    return standby.kind === 'cue' ? { ...state, standby: { kind: 'pageStart' } } : state;
  }
  if (standby.kind === 'pageStart') return { ...state, standby: firstStandby(page) };
  if (standby.kind !== 'cue' || page.markers.some((m) => m.id === standby.markerId)) return state;

  // The standby marker was removed: stand by on the first surviving marker that followed it.
  const removedIndex = previousMarkers.findIndex((m) => m.id === standby.markerId);
  const survivor = previousMarkers
    .slice(removedIndex + 1)
    .find((m) => page.markers.some((p) => p.id === m.id));
  return { ...state, standby: survivor ? { kind: 'cue', markerId: survivor.id } : afterLast(project, page.id) };
}
