import type { App } from '../app/app';
import {
  hasUnsavedChanges,
  loadFileRecord,
  projectSnapshot,
  saveFileRecord,
  type FileRecord,
} from '../storage/projectFile';
import { BACKUP_MEDIA_DIR, BACKUP_PROJECT_FILE, backupFileNames } from '../storage/backup';
import { importProjectJson } from '../storage/db';
import { h } from './dom';

// Chrome's File System Access API, which TypeScript's DOM types do not include yet.
type PickerOptions = {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
};
type FilePickers = {
  showOpenFilePicker(options?: PickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options?: PickerOptions): Promise<FileSystemFileHandle>;
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite'; id?: string }): Promise<FileSystemDirectoryHandle>;
};
/** Folder listing, which TypeScript's DOM types do not include yet. */
type ListableDirectory = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };

/** Progress and results of a backup, restore or media search, shown next to its buttons. */
export type Report = (message: string) => void;
type PermissionHandle = FileSystemFileHandle & {
  queryPermission(d: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(d: { mode: 'readwrite' }): Promise<PermissionState>;
};

const pickers = window as unknown as Partial<FilePickers>;
const FILE_TYPES = [{ description: 'Show Tracks project', accept: { 'application/json': ['.json'] } }];
const DEFAULT_NAME = 'show-tracks.json';

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

type Choice = 'save' | 'discard' | 'cancel';

/** New / Import / Export (Save As) / Save, with project files on disk. */
export function createFileMenu(app: App, db: IDBDatabase) {
  let file: FileRecord | null = null;
  const listeners: (() => void)[] = [];
  const changed = () => listeners.forEach((l) => l());

  const confirmDialog = h('dialog', { class: 'confirm' });

  /** Asks whether to save first; resolves 'cancel' when the dialog is dismissed. */
  function askToSave(action: string): Promise<Choice> {
    return new Promise((resolve) => {
      const choose = (choice: Choice) => () => {
        confirmDialog.close();
        resolve(choice);
      };
      confirmDialog.replaceChildren(
        h(
          'div',
          { class: 'settings' },
          h('h2', {}, 'Save changes?'),
          h('p', {}, `This project has changes that are not saved to a file. Save them before ${action}?`),
          h(
            'div',
            { class: 'actions' },
            h('button', { onclick: choose('cancel') }, 'Cancel'),
            h('button', { onclick: choose('discard') }, "Don't Save"),
            h('button', { class: 'primary', onclick: choose('save') }, 'Save'),
          ),
        ),
      );
      confirmDialog.onclose = () => resolve('cancel');
      confirmDialog.showModal();
      confirmDialog.querySelector<HTMLButtonElement>('.primary')?.focus();
    });
  }

  async function remember(record: FileRecord | null): Promise<void> {
    file = record;
    changed();
    try {
      await saveFileRecord(db, record);
    } catch {
      // A handle that cannot be stored only costs Save its target after a reload.
      await saveFileRecord(db, record && { ...record, handle: null }).catch(() => {});
    }
  }

  async function write(handle: FileSystemFileHandle): Promise<void> {
    const text = app.exportJson();
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    await remember({ handle, name: handle.name, saved: projectSnapshot(app.project) });
  }

  /** Returns false when nothing was saved (cancelled or failed). */
  async function saveAs(): Promise<boolean> {
    if (!pickers.showSaveFilePicker) {
      app.error('Saving files needs Chrome.');
      return false;
    }
    try {
      const handle = await pickers.showSaveFilePicker({ suggestedName: file?.name ?? DEFAULT_NAME, types: FILE_TYPES });
      await write(handle);
      return true;
    } catch (e) {
      if (!isAbort(e)) app.error(`Saving failed: ${(e as Error).message}`);
      return false;
    }
  }

  async function save(): Promise<boolean> {
    const handle = file?.handle as PermissionHandle | null | undefined;
    if (!handle) return saveAs();
    try {
      // Permission to write lapses when the browser restarts; asking again needs this click or key press.
      if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted' &&
          (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
        return saveAs();
      }
      await write(handle);
      return true;
    } catch (e) {
      if (isAbort(e)) return false;
      // The file may have been moved or deleted; let the user pick a place again.
      return saveAs();
    }
  }

  /** Gives the user a chance to save unsaved changes; false means stop. */
  async function okToReplace(action: string): Promise<boolean> {
    if (!hasUnsavedChanges(app.project, file)) return true;
    const choice = await askToSave(action);
    if (choice === 'cancel') return false;
    return choice === 'discard' || (await save());
  }

  async function newProject(): Promise<void> {
    if (!(await okToReplace('creating a new project'))) return;
    await app.newProject();
    await remember(null);
  }

  async function open(): Promise<void> {
    if (!(await okToReplace('opening another project'))) return;
    let handle: FileSystemFileHandle | null = null;
    let text: string;
    try {
      if (pickers.showOpenFilePicker) {
        [handle] = await pickers.showOpenFilePicker({ types: FILE_TYPES });
        text = await (await handle.getFile()).text();
      } else {
        const picked = await pickWithInput();
        if (!picked) return;
        text = await picked.text();
      }
    } catch (e) {
      if (!isAbort(e)) app.error(`Import failed: ${(e as Error).message}`);
      return;
    }
    if (!(await app.importJson(text))) return;
    await remember({ handle, name: handle?.name ?? DEFAULT_NAME, saved: projectSnapshot(app.project) });
  }

  function pickWithInput(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = h('input', { type: 'file', accept: 'application/json,.json' });
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  async function pickFolder(mode: 'read' | 'readwrite'): Promise<FileSystemDirectoryHandle | null> {
    if (!pickers.showDirectoryPicker) {
      app.error('Backups need Chrome.');
      return null;
    }
    try {
      return await pickers.showDirectoryPicker({ mode, id: 'show-tracks-backup' });
    } catch (e) {
      if (!isAbort(e)) app.error(`Could not open the folder: ${(e as Error).message}`);
      return null;
    }
  }

  /** Writes the project and every media file it uses into a folder. */
  async function backup(report: Report): Promise<void> {
    const folder = await pickFolder('readwrite');
    if (!folder) return;
    try {
      const records = await app.mediaRecords();
      const names = backupFileNames(records);
      const mediaFolder = await folder.getDirectoryHandle(BACKUP_MEDIA_DIR, { create: true });
      for (const [i, record] of records.entries()) {
        report(`Backing up media ${i + 1} / ${records.length}: ${names[record.id]}`);
        const writable = await (await mediaFolder.getFileHandle(names[record.id], { create: true })).createWritable();
        await writable.write(record.blob);
        await writable.close();
      }
      const writable = await (await folder.getFileHandle(BACKUP_PROJECT_FILE, { create: true })).createWritable();
      await writable.write(app.exportJson(names));
      await writable.close();
      report(`Backed up to “${folder.name}”: the project and ${records.length} media file(s).`);
    } catch (e) {
      report('');
      app.error(`Backup failed: ${(e as Error).message}`);
    }
  }

  /** Replaces the show with a backup folder: the project and its media together. */
  async function restore(report: Report): Promise<void> {
    if (app.editLocked() || !(await okToReplace('restoring a backup'))) return;
    const folder = await pickFolder('read');
    if (!folder) return;
    let text: string;
    try {
      text = await (await (await folder.getFileHandle(BACKUP_PROJECT_FILE)).getFile()).text();
    } catch {
      app.error(`“${folder.name}” is not a backup: ${BACKUP_PROJECT_FILE} is missing.`);
      return;
    }
    if (!(await app.importJson(text))) return;
    const { media, files } = importProjectJson(text);
    const items: { id: string; kind: 'audio' | 'video'; file: File }[] = [];
    let notFound = 0;
    const mediaFolder = await folder.getDirectoryHandle(BACKUP_MEDIA_DIR).catch(() => null);
    for (const [id, name] of Object.entries(files)) {
      const file = mediaFolder && (await mediaFolder.getFileHandle(name).then((f) => f.getFile()).catch(() => null));
      if (file && media[id]) items.push({ id, kind: media[id].kind, file });
      else notFound++;
    }
    const failed = await app.restoreMedia(items, (done, total) => report(`Restoring media ${done} / ${total}`));
    await remember({ handle: null, name: folder.name, saved: projectSnapshot(app.project) });
    const missing = notFound + failed;
    report(
      `Restored “${folder.name}” with ${items.length - failed} media file(s)` +
        (missing ? `; ${missing} could not be read.` : '.'),
    );
  }

  /** Finds missing media by file name in a folder (and the folders right inside it). */
  async function findMedia(report: Report): Promise<void> {
    if (app.editLocked()) return;
    const missing = app.missingMedia();
    if (missing.length === 0) {
      report('No media is missing.');
      return;
    }
    const folder = (await pickFolder('read')) as ListableDirectory | null;
    if (!folder) return;
    report('Looking for media…');
    const found = new Map<string, FileSystemFileHandle>();
    const look = async (dir: ListableDirectory, depth: number) => {
      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && !found.has(entry.name)) found.set(entry.name, entry as FileSystemFileHandle);
        else if (entry.kind === 'directory' && depth > 0) await look(entry as ListableDirectory, depth - 1);
      }
    };
    await look(folder, 1);
    const items: { id: string; kind: 'audio' | 'video'; file: File }[] = [];
    for (const m of missing) {
      const handle = found.get(m.fileName);
      if (handle) items.push({ id: m.id, kind: m.kind, file: await handle.getFile() });
    }
    const failed = await app.restoreMedia(items, (done, total) => report(`Loading media ${done} / ${total}`));
    const stillMissing = missing.length - items.length + failed;
    report(
      `Found ${items.length - failed} of ${missing.length} missing media file(s)` +
        (stillMissing ? `; still missing: ${missing.filter((m) => !items.some((i) => i.id === m.id)).map((m) => m.fileName).join(', ')}.` : '.'),
    );
  }

  return {
    confirmDialog,
    newProject,
    open,
    save,
    saveAs,
    backup,
    restore,
    findMedia,
    get fileName(): string | null {
      return file?.name ?? null;
    },
    get unsaved(): boolean {
      return hasUnsavedChanges(app.project, file);
    },
    onChange(listener: () => void): void {
      listeners.push(listener);
    },
    async load(): Promise<void> {
      try {
        file = await loadFileRecord(db);
      } catch {
        file = null;
      }
      changed();
    },
  };
}

export type FileMenu = ReturnType<typeof createFileMenu>;

/** The file buttons: Save also sits in the footer, all of them in Settings. */
export function fileButtons(menu: FileMenu, after: () => void = () => {}) {
  const button = (label: string, title: string, action: () => unknown) =>
    h('button', { type: 'button', title, onclick: async () => { await action(); after(); } }, label);
  return {
    new: button('New', 'New project', menu.newProject),
    import: button('Import', 'Open a project file', menu.open),
    export: button('Export', 'Save to a new file (⇧⌘S)', menu.saveAs),
    save: button('Save', 'Save (⌘S)', menu.save),
  };
}
