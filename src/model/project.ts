import { randomId, type Page, type Project, type Settings } from './types';

export function createPage(name: string, id: string = randomId()): Page {
  return {
    id,
    name,
    audioMediaId: null,
    videoMediaId: null,
    audioOffset: 0,
    videoOffset: 0,
    videoAudioEnabled: false,
    videoAudioVolume: 1,
    mtcOffset: 0,
    markers: [],
    nextCueNumber: 1,
  };
}

/** Fills in fields added after a project was saved, so older saves keep loading. */
export function normalizeProject(project: Project): Project {
  return {
    ...project,
    pages: project.pages.map((p) => ({ ...p, audioOffset: p.audioOffset ?? 0, videoOffset: p.videoOffset ?? 0 })),
  };
}

export function createProject(firstPage: Page = createPage('Page 1')): Project {
  return {
    pages: [firstPage],
    currentPageId: firstPage.id,
    settings: { mtcFps: '30', midiOutputId: null },
  };
}

export function currentPage(project: Project): Page {
  return project.pages.find((p) => p.id === project.currentPageId) ?? project.pages[0];
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
