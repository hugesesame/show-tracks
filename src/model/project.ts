import { randomId, type Page, type Project, type Settings } from './types';
import { orderMarkers } from './markers';

/** Initial track volume for new pages: leaves headroom to turn a track up. */
export const DEFAULT_VOLUME = 0.75;

/** A page without audio or video is a blank track this long, for cues against a DAW. */
export const BLANK_LENGTH = 5 * 60;

/** The Master strip starts at full level: the tracks already leave headroom. */
export const MASTER_VOLUME = 1;

const DEFAULT_SETTINGS: Settings = {
  mtcFps: '30',
  midiOutputId: null,
  midiInputId: null,
  mtcInputId: null,
  midiRemote: {},
  midiFaders: {},
  loopPages: false,
  fadeOut: 2,
  duckDepth: 12,
  duckFade: 0.5,
  masterVolume: MASTER_VOLUME,
  masterMuted: false,
  masterPan: 0,
  noteChannel: 1,
  noteNumber: 60,
  noteVelocity: 127,
  // Percent of the screen height, so the Memo view and the video output scale alike.
  memoSize: 8,
  memoColor: '#ffffff',
  memoOutline: 0.08,
  memoOutlineColor: '#000000',
  memoOutlineOn: true,
  memoPosition: 'bottom',
  memoFade: 0.5,
  memoFadeOn: true,
  memoOutput: true,
};

export function createPage(name: string, id: string = randomId()): Page {
  return {
    id,
    name,
    audioMediaId: null,
    videoMediaId: null,
    audioOffset: 0,
    videoOffset: 0,
    audioVolume: DEFAULT_VOLUME,
    audioMuted: false,
    videoAudioEnabled: false,
    videoAudioVolume: DEFAULT_VOLUME,
    audioPan: 0,
    videoPan: 0,
    rangeStart: null,
    rangeEnd: null,
    overlapAt: null,
    mtcOffset: 0,
    followMtc: false,
    blankLength: BLANK_LENGTH,
    endAction: 'stop',
    markers: [],
    midiNotes: true,
  };
}

/** Fills in fields added after a project was saved, so older saves keep loading. */
export function normalizeProject(project: Project): Project {
  return {
    ...project,
    settings: { ...DEFAULT_SETTINGS, ...project.settings },
    pages: project.pages.map((p) => ({
      ...p,
      audioOffset: p.audioOffset ?? 0,
      videoOffset: p.videoOffset ?? 0,
      audioVolume: p.audioVolume ?? 1,
      audioMuted: p.audioMuted ?? false,
      audioPan: p.audioPan ?? 0,
      videoPan: p.videoPan ?? 0,
      endAction: p.endAction ?? 'stop',
      rangeStart: p.rangeStart ?? null,
      rangeEnd: p.rangeEnd ?? null,
      overlapAt: p.overlapAt ?? null,
      followMtc: p.followMtc ?? false,
      blankLength: p.blankLength ?? BLANK_LENGTH,
      midiNotes: p.midiNotes ?? true,
      markers: orderMarkers(p.markers.map((m) => ({ ...m, midiOn: m.midiOn ?? false, note: m.note ?? null, memo: m.memo ?? '' }))),
    })),
  };
}

export function createProject(firstPage: Page = createPage('Page 1')): Project {
  return {
    pages: [firstPage],
    currentPageId: firstPage.id,
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** The page follows the MTC coming in from a DAW: it is set to, and has no audio of its own. */
export function followsMtc(page: Page): boolean {
  return page.followMtc && page.audioMediaId === null;
}

/**
 * PAGES keeps two lists: Play pages play their own media; MTC In pages follow a DAW.
 * Running order, Next and moving pages stay within a list.
 */
export type PageKind = 'play' | 'mtc';

export const pageKind = (page: Page): PageKind => (page.followMtc ? 'mtc' : 'play');

export function pagesOfKind(project: Project, kind: PageKind): Page[] {
  return project.pages.filter((p) => pageKind(p) === kind);
}

export function currentPage(project: Project): Page {
  return project.pages.find((p) => p.id === project.currentPageId) ?? project.pages[0];
}

/** The page after `pageId` in its list; after the last Play page, the first one when looping pages. */
export function nextPage(project: Project, pageId: string): Page | null {
  const page = project.pages.find((p) => p.id === pageId);
  if (!page) return null;
  const pages = pagesOfKind(project, pageKind(page));
  const index = pages.indexOf(page);
  if (index < pages.length - 1) return pages[index + 1];
  return project.settings.loopPages && pageKind(page) === 'play' ? pages[0] : null;
}

export function setCurrentPage(project: Project, pageId: string): Project {
  if (!project.pages.some((p) => p.id === pageId)) return project;
  return { ...project, currentPageId: pageId };
}

/** Appends the page and selects it. */
export function addPage(project: Project, page: Page): Project {
  return { ...project, pages: [...project.pages, page], currentPageId: page.id };
}

/**
 * Removes the page, selecting the next one in its list (or the previous if it was last),
 * or a page of the other list when it was the last of its own. The last page cannot be removed.
 */
export function removePage(project: Project, pageId: string): Project {
  const page = project.pages.find((p) => p.id === pageId);
  if (!page || project.pages.length === 1) return project;
  const kind = pageKind(page);
  const index = pagesOfKind(project, kind).indexOf(page);
  const pages = project.pages.filter((p) => p.id !== pageId);
  const rest = pages.filter((p) => pageKind(p) === kind);
  const currentPageId =
    project.currentPageId !== pageId
      ? project.currentPageId
      : (rest[Math.min(index, rest.length - 1)] ?? pages[0]).id;
  return { ...project, pages, currentPageId };
}

export function updatePage(project: Project, pageId: string, patch: Partial<Omit<Page, 'id'>>): Project {
  return { ...project, pages: project.pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)) };
}

/** Replaces a page with the result of a page-level operation (e.g. a marker edit). */
export function replacePage(project: Project, page: Page): Project {
  return { ...project, pages: project.pages.map((p) => (p.id === page.id ? page : p)) };
}

export function renamePage(project: Project, pageId: string, name: string): Project {
  return updatePage(project, pageId, { name });
}

/** Moves a page to `toIndex` in its own list (counted without it). */
export function movePage(project: Project, pageId: string, toIndex: number): Project {
  const page = project.pages.find((p) => p.id === pageId);
  if (!page) return project;
  const pages = project.pages.filter((p) => p.id !== pageId);
  const list = pages.filter((p) => pageKind(p) === pageKind(page));
  const index = Math.min(Math.max(toIndex, 0), list.length);
  // Before the page it lands on, or after the last of its list.
  const at = index < list.length ? pages.indexOf(list[index]) : list.length ? pages.indexOf(list[list.length - 1]) + 1 : pages.length;
  pages.splice(at, 0, page);
  return { ...project, pages };
}

export function updateSettings(project: Project, patch: Partial<Settings>): Project {
  return { ...project, settings: { ...project.settings, ...patch } };
}

/**
 * A state Undo goes back to, keeping what is live now: the mixer (levels, pan,
 * mute, Master), the MIDI ports and the page on screen are not undone.
 */
export function keepLive(state: Project, current: Project): Project {
  const now = new Map(current.pages.map((p) => [p.id, p]));
  const { masterVolume, masterMuted, masterPan, midiOutputId, midiInputId, mtcInputId } = current.settings;
  return {
    ...state,
    currentPageId: state.pages.some((p) => p.id === current.currentPageId) ? current.currentPageId : state.currentPageId,
    settings: { ...state.settings, masterVolume, masterMuted, masterPan, midiOutputId, midiInputId, mtcInputId },
    pages: state.pages.map((p) => {
      const live = now.get(p.id);
      if (!live) return p;
      const { audioVolume, audioMuted, audioPan, videoAudioVolume, videoAudioEnabled, videoPan } = live;
      return { ...p, audioVolume, audioMuted, audioPan, videoAudioVolume, videoAudioEnabled, videoPan };
    }),
  };
}
