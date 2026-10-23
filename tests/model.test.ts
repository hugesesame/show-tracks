import { describe, expect, it } from 'vitest';
import {
  addMarker,
  nudgeMarker,
  removeMarker,
  renameMarker,
  setMarkerTime,
} from '../src/model/markers';
import {
  addPage,
  createPage,
  createProject,
  currentPage,
  movePage,
  normalizeProject,
  removePage,
  renamePage,
  setCurrentPage,
  updatePage,
  updateSettings,
} from '../src/model/project';
import type { Page } from '../src/model/types';

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

const pageWith = (...times: number[]): Page => {
  const nextId = ids();
  let page = createPage('P', 'page');
  for (const t of times) page = addMarker(page, t, 100, nextId).page;
  return page;
};

describe('markers', () => {
  it('keeps markers in time order with automatic names numbered by row', () => {
    const page = pageWith(30, 10, 20);
    expect(page.markers.map((m) => [m.id, m.name, m.time])).toEqual([
      ['id2', 'Cue 1', 10],
      ['id3', 'Cue 2', 20],
      ['id1', 'Cue 3', 30],
    ]);
  });

  it('returns the new marker', () => {
    const { marker } = addMarker(createPage('P', 'p'), 5, 100, () => 'm');
    expect(marker).toEqual({ id: 'm', name: 'Cue 1', time: 5 });
  });

  it('closes the gap in the numbers when a marker is removed', () => {
    let page = pageWith(10, 20, 30);
    page = removeMarker(page, 'id2');
    expect(page.markers.map((m) => [m.id, m.name])).toEqual([
      ['id1', 'Cue 1'],
      ['id3', 'Cue 2'],
    ]);
  });

  it('renumbers when a marker passes another', () => {
    let page = pageWith(10, 20, 30);
    page = nudgeMarker(page, 'id1', 15, 100);
    expect(page.markers.map((m) => [m.id, m.name, m.time])).toEqual([
      ['id2', 'Cue 1', 20],
      ['id1', 'Cue 2', 25],
      ['id3', 'Cue 3', 30],
    ]);
  });

  it('keeps typed-in names and counts their rows', () => {
    let page = pageWith(10, 20, 30);
    page = renameMarker(page, 'id1', 'Starts');
    page = addMarker(page, 5, 100, () => 'new').page;
    expect(page.markers.map((m) => m.name)).toEqual(['Cue 1', 'Starts', 'Cue 3', 'Cue 4']);
  });

  it('renumbers markers from older saves', () => {
    let project = createProject(createPage('A', 'a'));
    project = updatePage(project, 'a', {
      markers: [
        { id: 'x', name: 'Cue 12', time: 9 },
        { id: 'y', name: 'Cue 10', time: 3 },
      ],
    });
    expect(normalizeProject(project).pages[0].markers.map((m) => m.name)).toEqual(['Cue 1', 'Cue 2']);
  });

  it('fills in pan, Master and in / out points missing from older saves', () => {
    const old = JSON.parse(JSON.stringify(createProject(createPage('A', 'a'))));
    for (const key of ['masterVolume', 'masterMuted', 'masterPan']) delete old.settings[key];
    for (const key of ['audioPan', 'videoPan', 'rangeStart', 'rangeEnd']) delete old.pages[0][key];
    const project = normalizeProject(old);
    expect(project.settings).toMatchObject({ masterVolume: 1, masterMuted: false, masterPan: 0 });
    expect(project.pages[0]).toMatchObject({ audioPan: 0, videoPan: 0, rangeStart: null, rangeEnd: null });
  });

  it('clamps times to the media length', () => {
    let page = pageWith(10);
    page = nudgeMarker(page, 'id1', -60, 100);
    expect(page.markers[0].time).toBe(0);
    page = setMarkerTime(page, 'id1', 500, 100);
    expect(page.markers[0].time).toBe(100);
    expect(addMarker(page, -3, 100, () => 'x').marker.time).toBe(0);
  });

  it('renames a marker', () => {
    const page = renameMarker(pageWith(10), 'id1', 'Opening');
    expect(page.markers[0].name).toBe('Opening');
  });

  it('ignores unknown marker ids', () => {
    const page = pageWith(10);
    expect(removeMarker(page, 'nope')).toEqual(page);
    expect(nudgeMarker(page, 'nope', 1, 100)).toEqual(page);
  });
});

describe('project', () => {
  const setup = () => {
    let project = createProject(createPage('A', 'a'));
    project = addPage(project, createPage('B', 'b'));
    project = addPage(project, createPage('C', 'c'));
    return project;
  };

  it('starts with one page selected and default settings', () => {
    const project = createProject(createPage('A', 'a'));
    expect(project.currentPageId).toBe('a');
    expect(project.settings).toEqual({
      mtcFps: '30',
      midiOutputId: null,
      loopPages: false,
      masterVolume: 1,
      masterMuted: false,
      masterPan: 0,
    });
  });

  it('creates pages with defaults', () => {
    expect(createPage('A', 'a')).toEqual({
      id: 'a',
      name: 'A',
      audioMediaId: null,
      videoMediaId: null,
      audioOffset: 0,
      videoOffset: 0,
      audioVolume: 0.75,
      audioMuted: false,
      videoAudioEnabled: false,
      videoAudioVolume: 0.75,
      audioPan: 0,
      videoPan: 0,
      rangeStart: null,
      rangeEnd: null,
      mtcOffset: 0,
      endAction: 'stop',
      markers: [],
    });
  });

  it('adds a page at the end and selects it', () => {
    const project = setup();
    expect(project.pages.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(currentPage(project).id).toBe('c');
  });

  it('removes a page and selects its neighbour', () => {
    let project = setCurrentPage(setup(), 'b');
    project = removePage(project, 'b');
    expect(project.pages.map((p) => p.id)).toEqual(['a', 'c']);
    expect(project.currentPageId).toBe('c');
    project = removePage(project, 'c');
    expect(project.currentPageId).toBe('a');
  });

  it('keeps at least one page', () => {
    const project = createProject(createPage('A', 'a'));
    expect(removePage(project, 'a')).toEqual(project);
  });

  it('renames, moves and updates pages', () => {
    let project = setup();
    project = renamePage(project, 'a', 'Intro');
    project = movePage(project, 'c', 0);
    project = updatePage(project, 'b', { mtcOffset: 7200 });
    expect(project.pages.map((p) => [p.id, p.name])).toEqual([
      ['c', 'C'],
      ['a', 'Intro'],
      ['b', 'B'],
    ]);
    expect(project.pages[2].mtcOffset).toBe(7200);
  });

  it('ignores selecting an unknown page', () => {
    const project = setup();
    expect(setCurrentPage(project, 'zzz')).toEqual(project);
  });

  it('updates settings', () => {
    const project = updateSettings(setup(), { mtcFps: '25' });
    expect(project.settings.mtcFps).toBe('25');
  });
});

describe('nextPage', () => {
  it('returns the following page, wrapping only when looping', async () => {
    const { nextPage } = await import('../src/model/project');
    let project = createProject(createPage('A', 'a'));
    project = addPage(project, createPage('B', 'b'));
    expect(nextPage(project, 'a')?.id).toBe('b');
    expect(nextPage(project, 'b')).toBeNull();
    expect(nextPage(updateSettings(project, { loopPages: true }), 'b')?.id).toBe('a');
  });
});
