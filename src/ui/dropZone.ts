import type { App } from '../app/app';
import { readCsvIntoCues } from './cueCsv';
import { h } from './dom';
import type { createFileMenu } from './fileMenu';

type DataTransferItemWithHandle = DataTransferItem & { getAsFileSystemHandle?(): Promise<FileSystemHandle | null> };

const isCsv = (file: File) => file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv');
const isProjectFile = (file: File) => file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');

/**
 * Files dropped anywhere on the window, alongside the Choose and Import buttons:
 * audio and video go onto the pages, a project file opens as Import does,
 * and a CSV fills the cue memos.
 * The window shows it takes them while files are dragged over it.
 */
export function installDropZone(app: App, files: ReturnType<typeof createFileMenu>): HTMLElement {
  const message = h('div', { class: 'drop-message' });
  const overlay = h('div', { class: 'drop-zone', hidden: true }, message);
  // dragenter / dragleave fire for every element crossed, so count them.
  let depth = 0;
  const carriesFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
  const hide = () => {
    depth = 0;
    overlay.hidden = true;
  };

  window.addEventListener('dragenter', (e) => {
    if (!carriesFiles(e)) return;
    depth++;
    const locked = app.showMode;
    overlay.classList.toggle('locked', locked);
    message.textContent = locked
      ? 'Show mode: files cannot be added'
      : 'Drop audio or video: one goes onto this page, several make a page each. A project file opens; a CSV fills this page’s cue memos.';
    overlay.hidden = false;
  });
  window.addEventListener('dragleave', (e) => {
    if (carriesFiles(e) && --depth <= 0) hide();
  });
  // Without these the browser would open the file in place of the app.
  window.addEventListener('dragover', (e) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = app.showMode ? 'none' : 'copy';
  });
  window.addEventListener('drop', (e) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    hide();
    if (app.showMode) return;
    const dropped = [...(e.dataTransfer?.files ?? [])];
    if (dropped.length === 1 && isProjectFile(dropped[0])) {
      // The handle can only be asked for during the drop event; with it Save writes back to the file.
      const item = e.dataTransfer?.items[0] as DataTransferItemWithHandle | undefined;
      const handle = item?.getAsFileSystemHandle?.() ?? Promise.resolve(null);
      void handle
        .catch(() => null)
        .then((h) => files.openDropped(dropped[0], h?.kind === 'file' ? (h as FileSystemFileHandle) : null));
      return;
    }
    // A CSV fills this page's cue memos, as Import CSV does.
    if (dropped.length === 1 && isCsv(dropped[0])) {
      void readCsvIntoCues(app, dropped[0]);
      return;
    }
    void app.dropMedia(dropped);
  });
  return overlay;
}
