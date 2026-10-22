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
  it('adds markers with sequential names, kept in time order', () => {
    const page = pageWith(30, 10, 20);
    expect(page.markers.map((m) => [m.name, m.time])).toEqual([
      ['Cue 2', 10],
      ['Cue 3', 20],
      ['Cue 1', 30],
    ]);
  });

  it('returns the new marker', () => {
    const { marker } = addMarker(createPage('P', 'p'), 5, 100, () => 'm');
    expect(marker).toEqual({ id: 'm', name: 'Cue 1', time: 5 });
  });

  it('never reuses a number after a marker is removed', () => {
    let page = pageWith(10, 20);
    page = removeMarker(page, 'id2');
    page = addMarker(page, 30, 100, () => 'new').page;
    expect(page.markers.map((m) => m.name)).toEqual(['Cue 1', 'Cue 3']);
  });

  it('re-sorts when a marker passes another, keeping its name', () => {
    let page = pageWith(10, 20, 30);
    page = nudgeMarker(page, 'id1', 15, 100);
    expect(page.markers.map((m) => [m.name, m.time])).toEqual([
      ['Cue 2', 20],
      ['Cue 1', 25],
      ['Cue 3', 30],
    ]);
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
    expect(project.settings).toEqual({ mtcFps: '30', midiOutputId: null });
  });

  it('creates pages with defaults', () => {
    expect(createPage('A', 'a')).toEqual({
      id: 'a',
      name: 'A',
      audioMediaId: null,
      videoMediaId: null,
      videoAudioEnabled: false,
      videoAudioVolume: 1,
      mtcOffset: 0,
      markers: [],
      nextCueNumber: 1,
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
