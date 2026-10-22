import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addMarker } from '../src/model/markers';
import { addPage, createPage, createProject, replacePage, setCurrentPage } from '../src/model/project';
import { openDb } from '../src/storage/db';
import {
  hasUnsavedChanges,
  isEmptyProject,
  loadFileRecord,
  projectSnapshot,
  saveFileRecord,
} from '../src/storage/projectFile';

const withMarker = () => {
  const project = createProject(createPage('A', 'a'));
  return replacePage(project, addMarker(project.pages[0], 5, 100, () => 'm1').page);
};

describe('project file state', () => {
  it('treats a fresh project as having nothing to save', () => {
    expect(isEmptyProject(createProject())).toBe(true);
    expect(hasUnsavedChanges(createProject(), null)).toBe(false);
    expect(hasUnsavedChanges(withMarker(), null)).toBe(true);
  });

  it('compares against the last saved snapshot', () => {
    const project = withMarker();
    const file = { handle: null, name: 'a.json', saved: projectSnapshot(project) };
    expect(hasUnsavedChanges(project, file)).toBe(false);
    expect(hasUnsavedChanges(addPage(project, createPage('B', 'b')), file)).toBe(true);
  });

  it('ignores which page is selected', () => {
    const project = addPage(withMarker(), createPage('B', 'b'));
    const file = { handle: null, name: 'a.json', saved: projectSnapshot(project) };
    expect(hasUnsavedChanges(setCurrentPage(project, 'b'), file)).toBe(false);
  });

  it('stores and clears the file record', async () => {
    const db = await openDb('project-file-test');
    expect(await loadFileRecord(db)).toBeNull();
    await saveFileRecord(db, { handle: null, name: 'show.json', saved: '{}' });
    expect(await loadFileRecord(db)).toEqual({ handle: null, name: 'show.json', saved: '{}' });
    await saveFileRecord(db, null);
    expect(await loadFileRecord(db)).toBeNull();
  });
});
