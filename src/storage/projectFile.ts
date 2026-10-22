import type { Project } from '../model/types';

const PROJECT_STORE = 'project';
const FILE_KEY = 'file';

/** The project file on disk that Save writes to, and what it last held. */
export type FileRecord = {
  handle: FileSystemFileHandle | null;
  name: string;
  /** projectSnapshot() of the project as last saved or opened. */
  saved: string;
};

/** What a project file holds that matters for "unsaved changes"; the selected page does not count. */
export function projectSnapshot(project: Project): string {
  return JSON.stringify({ ...project, currentPageId: '' });
}

/** A project with nothing in it yet, so there is nothing to lose. */
export function isEmptyProject(project: Project): boolean {
  return (
    project.pages.length === 1 &&
    project.pages.every((p) => p.audioMediaId === null && p.videoMediaId === null && p.markers.length === 0)
  );
}

/** True when the project has changes that were never saved to a file. */
export function hasUnsavedChanges(project: Project, file: FileRecord | null): boolean {
  return file ? projectSnapshot(project) !== file.saved : !isEmptyProject(project);
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, mode);
    const request = op(tx.objectStore(PROJECT_STORE));
    tx.oncomplete = () => resolve(request.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadFileRecord(db: IDBDatabase): Promise<FileRecord | null> {
  return (await run<FileRecord | undefined>(db, 'readonly', (s) => s.get(FILE_KEY))) ?? null;
}

export async function saveFileRecord(db: IDBDatabase, record: FileRecord | null): Promise<void> {
  await run(db, 'readwrite', (s) => (record ? s.put(record, FILE_KEY) : s.delete(FILE_KEY)));
}
