import type { App } from '../app/app';
import {
  hasUnsavedChanges,
  loadFileRecord,
  projectSnapshot,
  saveFileRecord,
  type FileRecord,
} from '../storage/projectFile';
import { h } from './dom';

// Chrome's File System Access API, which TypeScript's DOM types do not include yet.
type PickerOptions = {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
};
type FilePickers = {
  showOpenFilePicker(options?: PickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options?: PickerOptions): Promise<FileSystemFileHandle>;
};
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

  return {
    confirmDialog,
    newProject,
    open,
    save,
    saveAs,
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

/** The four file buttons, shared by the footer and Settings. */
export function fileButtons(menu: FileMenu, after: () => void = () => {}): HTMLButtonElement[] {
  const button = (label: string, title: string, action: () => unknown) =>
    h('button', { type: 'button', title, onclick: async () => { await action(); after(); } }, label);
  return [
    button('New', 'New project', menu.newProject),
    button('Import', 'Open a project file', menu.open),
    button('Export', 'Save to a new file (⇧⌘S)', menu.saveAs),
    button('Save', 'Save (⌘S)', menu.save),
  ];
}
