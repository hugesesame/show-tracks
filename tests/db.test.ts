import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAutosaver,
  deleteMedia,
  exportProjectJson,
  getMedia,
  importProjectJson,
  loadProject,
  openDb,
  pagesWithMissingMedia,
  putMedia,
  saveProject,
} from '../src/storage/db';
import { addMarker } from '../src/model/markers';
import { createPage, createProject, replacePage, updatePage } from '../src/model/project';
import type { MediaRecord } from '../src/model/types';

let dbCount = 0;
const freshDb = () => openDb(`test-${++dbCount}`);

const sampleProject = () => {
  let project = createProject(createPage('A', 'a'));
  project = replacePage(project, addMarker(project.pages[0], 12, 100, () => 'm1').page);
  return updatePage(project, 'a', { audioMediaId: 'audio1' });
};

const sampleMedia = (): MediaRecord => ({
  id: 'audio1',
  kind: 'audio',
  fileName: 'song.wav',
  mimeType: 'audio/wav',
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
  duration: 100,
  peaks: new Float32Array([-0.5, 0.5]),
});

describe('project store', () => {
  it('returns null when nothing is saved', async () => {
    expect(await loadProject(await freshDb())).toBeNull();
  });

  it('round-trips the project', async () => {
    const db = await freshDb();
    await saveProject(db, sampleProject());
    expect(await loadProject(db)).toEqual(sampleProject());
  });
});

describe('media store', () => {
  it('stores, reads and deletes media', async () => {
    const db = await freshDb();
    await putMedia(db, sampleMedia());
    const media = await getMedia(db, 'audio1');
    expect(media?.fileName).toBe('song.wav');
    expect(Array.from(media!.peaks!)).toEqual([-0.5, 0.5]);
    expect(new Uint8Array(await media!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    await deleteMedia(db, 'audio1');
    expect(await getMedia(db, 'audio1')).toBeNull();
  });
});

describe('createAutosaver', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves only the latest project, 500ms after the last change', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const autosaver = createAutosaver(save);
    const first = createProject(createPage('A', 'a'));
    const second = createProject(createPage('B', 'b'));
    autosaver.schedule(first);
    vi.advanceTimersByTime(300);
    autosaver.schedule(second);
    vi.advanceTimersByTime(499);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledExactlyOnceWith(second);
  });

  it('saves immediately on flush', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const autosaver = createAutosaver(save);
    autosaver.schedule(createProject(createPage('A', 'a')));
    await autosaver.flush();
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reports save failures', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const autosaver = createAutosaver(() => Promise.reject(new Error('quota')), onError);
    autosaver.schedule(createProject(createPage('A', 'a')));
    await autosaver.flush();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'quota' }));
  });
});

describe('JSON export / import', () => {
  it('round-trips the project with media file names but not media data', () => {
    const json = exportProjectJson(sampleProject(), [sampleMedia()]);
    expect(json).not.toContain('peaks');
    const imported = importProjectJson(json);
    expect(imported.project).toEqual(sampleProject());
    expect(imported.media).toEqual({ audio1: { kind: 'audio', fileName: 'song.wav' } });
  });

  it('rejects files that are not projects', () => {
    expect(() => importProjectJson('not json')).toThrow();
    expect(() => importProjectJson('{"version":99}')).toThrow();
    expect(() => importProjectJson('{"version":1,"project":{}}')).toThrow();
  });
});

describe('pagesWithMissingMedia', () => {
  it('lists pages whose media is not stored', () => {
    let project = sampleProject();
    project = updatePage(project, 'a', { videoMediaId: 'video1' });
    expect(pagesWithMissingMedia(project, new Set(['audio1']))).toEqual(['a']);
    expect(pagesWithMissingMedia(project, new Set(['audio1', 'video1']))).toEqual([]);
  });
});
