import { randomId, type Page, type Project, type Settings } from './types';
import { orderMarkers } from './markers';

/** Initial track volume for new pages: leaves headroom to turn a track up. */
export const DEFAULT_VOLUME = 0.75;

/** The Master strip starts at full level: the tracks already leave headroom. */
export const MASTER_VOLUME = 1;

const DEFAULT_SETTINGS: Settings = {
  mtcFps: '30',
  midiOutputId: null,
  loopPages: false,
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

export function currentPage(project: Project): Page {
  return project.pages.find((p) => p.id === project.currentPageId) ?? project.pages[0];
}

/** The page after `pageId`; after the last page, the first one when looping pages. */
export function nextPage(project: Project, pageId: string): Page | null {
  const index = project.pages.findIndex((p) => p.id === pageId);
  if (index < 0) return null;
  if (index < project.pages.length - 1) return project.pages[index + 1];
  return project.settings.loopPages ? project.pages[0] : null;
}

export function setCurrentPage(project: Project, pageId: string): Project {
  if (!project.pages.some((p) => p.id === pageId)) return project;
  return { ...project, currentPageId: pageId };
}

/** Appends the page and selects it. */
export function addPage(project: Project, page: Page): Project {
  return { ...project, pages: [...project.pages, page], currentPageId: page.id };
}

/** Removes the page, selecting the next one (or the previous if it was last). The last page cannot be removed. */
export function removePage(project: Project, pageId: string): Project {
  const index = project.pages.findIndex((p) => p.id === pageId);
  if (index < 0 || project.pages.length === 1) return project;
  const pages = project.pages.filter((p) => p.id !== pageId);
  const currentPageId =
    project.currentPageId === pageId ? pages[Math.min(index, pages.length - 1)].id : project.currentPageId;
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

export function movePage(project: Project, pageId: string, toIndex: number): Project {
  const page = project.pages.find((p) => p.id === pageId);
  if (!page) return project;
  const pages = project.pages.filter((p) => p.id !== pageId);
  pages.splice(Math.min(Math.max(toIndex, 0), pages.length), 0, page);
  return { ...project, pages };
}

export function updateSettings(project: Project, patch: Partial<Settings>): Project {
  return { ...project, settings: { ...project.settings, ...patch } };
}
