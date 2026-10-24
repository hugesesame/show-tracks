import { describe, expect, it } from 'vitest';
import { backupFileNames } from '../src/storage/backup';
import { exportProjectJson, importProjectJson } from '../src/storage/db';
import { createProject } from '../src/model/project';

describe('backupFileNames', () => {
  it('keeps the original names, numbering the ones that clash', () => {
    expect(
      backupFileNames([
        { id: 'a', fileName: 'song.wav' },
        { id: 'b', fileName: 'Song.wav' },
        { id: 'c', fileName: 'video.mp4' },
        { id: 'd', fileName: 'song.wav' },
        { id: 'e', fileName: 'notes' },
        { id: 'f', fileName: 'notes' },
      ]),
    ).toEqual({ a: 'song.wav', b: 'Song (2).wav', c: 'video.mp4', d: 'song (3).wav', e: 'notes', f: 'notes (2)' });
  });
});

describe('project files with backup file names', () => {
  it('carry the media folder names in a backup, and none otherwise', () => {
    const project = createProject();
    expect(importProjectJson(exportProjectJson(project, [], { a: 'song.wav' })).files).toEqual({ a: 'song.wav' });
    expect(importProjectJson(exportProjectJson(project, [])).files).toEqual({});
  });
});
