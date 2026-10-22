import { normalizeProject } from '../model/project';
import type { MediaRecord, Project } from '../model/types';

const PROJECT_STORE = 'project';
const MEDIA_STORE = 'media';
const PROJECT_KEY = 'current';

export function openDb(name = 'cue-player'): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(PROJECT_STORE);
      db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = op(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadProject(db: IDBDatabase): Promise<Project | null> {
  const project = await run<Project | undefined>(db, PROJECT_STORE, 'readonly', (s) => s.get(PROJECT_KEY));
  return project ? normalizeProject(project) : null;
}

export async function saveProject(db: IDBDatabase, project: Project): Promise<void> {
  await run(db, PROJECT_STORE, 'readwrite', (s) => s.put(project, PROJECT_KEY));
}

export async function putMedia(db: IDBDatabase, media: MediaRecord): Promise<void> {
  await run(db, MEDIA_STORE, 'readwrite', (s) => s.put(media));
}

export async function getMedia(db: IDBDatabase, id: string): Promise<MediaRecord | null> {
  return (await run<MediaRecord | undefined>(db, MEDIA_STORE, 'readonly', (s) => s.get(id))) ?? null;
}

export async function deleteMedia(db: IDBDatabase, id: string): Promise<void> {
  await run(db, MEDIA_STORE, 'readwrite', (s) => s.delete(id));
}

export async function listMediaIds(db: IDBDatabase): Promise<Set<string>> {
  return new Set(await run<string[]>(db, MEDIA_STORE, 'readonly', (s) => s.getAllKeys()));
}

export type Autosaver = {
  schedule(project: Project): void;
  flush(): Promise<void>;
  /** The latest project not saved yet, if any. */
  pending(): Project | null;
};

/**
 * Saves the latest scheduled project `delayMs` after the last change, and at
 * most `maxWaitMs` after the first unsaved one so a steady stream of edits
 * cannot postpone saving indefinitely.
 */
export function createAutosaver(
  save: (project: Project) => Promise<void>,
  onError: (error: unknown) => void = console.error,
  delayMs = 500,
  maxWaitMs = 2000,
): Autosaver {
  let pending: Project | null = null;
  let pendingSince = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = async () => {
    clearTimeout(timer);
    timer = undefined;
    if (!pending) return;
    const project = pending;
    pending = null;
    try {
      await save(project);
    } catch (error) {
      onError(error);
    }
  };

  return {
    schedule(project) {
      if (!pending) pendingSince = Date.now();
      pending = project;
      clearTimeout(timer);
      const untilMaxWait = maxWaitMs - (Date.now() - pendingSince);
      timer = setTimeout(() => void flush(), Math.max(0, Math.min(delayMs, untilMaxWait)));
    },
    flush,
    pending: () => pending,
  };
}

const STASH_KEY = 'cue-player-unsaved';

/**
 * IndexedDB writes started while the page unloads often never finish, so
 * unsaved changes are stashed synchronously in localStorage instead.
 */
export function stashUnsaved(project: Project, storage: Storage = localStorage): void {
  try {
    storage.setItem(STASH_KEY, JSON.stringify(project));
  } catch {
    // Nothing more can be done while the page is going away.
  }
}

/** Returns (and removes) changes stashed on the last unload. */
export function takeStashed(storage: Storage = localStorage): Project | null {
  try {
    const text = storage.getItem(STASH_KEY);
    storage.removeItem(STASH_KEY);
    return text ? normalizeProject(JSON.parse(text) as Project) : null;
  } catch {
    return null;
  }
}

const EXPORT_VERSION = 1;

export type ExportedMedia = Record<string, { kind: MediaRecord['kind']; fileName: string }>;

/** Exports the project with media file names only; media data stays in the browser. */
export function exportProjectJson(project: Project, media: MediaRecord[]): string {
  const mediaInfo: ExportedMedia = {};
  for (const m of media) mediaInfo[m.id] = { kind: m.kind, fileName: m.fileName };
  return JSON.stringify({ version: EXPORT_VERSION, project, media: mediaInfo }, null, 2);
}

export function importProjectJson(text: string): { project: Project; media: ExportedMedia } {
  const data = JSON.parse(text);
  if (data?.version !== EXPORT_VERSION) throw new Error('Unsupported file');
  const project = data.project;
  if (!Array.isArray(project?.pages) || project.pages.length === 0 || typeof project.currentPageId !== 'string') {
    throw new Error('Invalid project format');
  }
  return { project: normalizeProject(project as Project), media: (data.media ?? {}) as ExportedMedia };
}

/** Ids of pages that reference media not present in the store. */
export function pagesWithMissingMedia(project: Project, storedIds: Set<string>): string[] {
  return project.pages
    .filter((p) => [p.audioMediaId, p.videoMediaId].some((id) => id !== null && !storedIds.has(id)))
    .map((p) => p.id);
}

export async function requestPersistentStorage(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  const estimate = await navigator.storage?.estimate?.();
  return estimate ? { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 } : null;
}
