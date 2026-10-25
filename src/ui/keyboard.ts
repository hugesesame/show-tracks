import type { App } from '../app/app';
import { isEditing } from './dom';
import type { FileMenu } from './fileMenu';
import { toggleFullscreen } from './fullscreen';

export type ZoomControls = { zoomIn(): void; zoomOut(): void; zoomFit(): void };

export function installKeyboard(
  app: App,
  zoom: ZoomControls,
  files: FileMenu,
  openSettings: () => void,
  openHelp: () => void,
): void {
  window.addEventListener('keydown', (e) => {
    // ⌘S saves, ⇧⌘S saves to a new file; they work while typing too.
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') {
      e.preventDefault();
      // Blurring commits a field being edited before the project is written.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      void (e.shiftKey ? files.saveAs() : files.save());
      return;
    }
    // ⌘Z / ⇧⌘Z undo and redo edits; while typing, the field's own undo applies.
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ' && !isEditing(e.target)) {
      e.preventDefault();
      if (document.querySelector('dialog[open]')) return;
      if (e.shiftKey) app.redo();
      else app.undo();
      return;
    }
    // ⌘, (Ctrl+, elsewhere) opens Settings, as in most apps.
    if ((e.metaKey || e.ctrlKey) && e.code === 'Comma') {
      e.preventDefault();
      if (!document.querySelector('dialog[open]')) openSettings();
      return;
    }
    if (isEditing(e.target) || e.metaKey || e.ctrlKey) return;
    if (document.querySelector('dialog[open]')) return;

    // = / + zoom in, - zooms out. e.key first so a JIS keyboard's Shift+- ("=") zooms in;
    // e.code covers an active IME, where e.key is "Process".
    if (e.key === '?') {
      e.preventDefault();
      openHelp();
      return;
    }

    // / fits the track to the end point; so does Shift+Z, as in Final Cut Pro and Resolve.
    if (e.key === '/' || (e.code === 'Slash' && !e.shiftKey) || (e.code === 'KeyZ' && e.shiftKey)) {
      e.preventDefault();
      zoom.zoomFit();
      return;
    }

    const zoomKey =
      e.key === '=' || e.key === '+' ? 'in' : e.key === '-' ? 'out'
      : e.code === 'Equal' ? 'in' : e.code === 'Minus' ? 'out' : null;
    if (zoomKey) {
      e.preventDefault();
      if (zoomKey === 'in') zoom.zoomIn();
      else zoom.zoomOut();
      return;
    }

    const actions: Record<string, () => void> = {
      Space: () => app.togglePlay(),
      KeyG: () => app.go(),
      KeyM: () => app.addMarkerAtPlayhead(),
      KeyF: () => toggleFullscreen(),
      // I / O set the in / out point at the playhead; with Option they clear it.
      KeyI: () => (e.altKey ? app.setRangePoint('start', null) : app.setRangePointAtPlayhead('start')),
      KeyO: () => (e.altKey ? app.setRangePoint('end', null) : app.setRangePointAtPlayhead('end')),
      // X places the overlap mark, where the next page starts while this one rings out.
      KeyX: () => (e.altKey ? app.setRangePoint('overlap', null) : app.setRangePointAtPlayhead('overlap')),
      // Arrows jump between markers; with Option they rewind / fast forward.
      ArrowLeft: () => (e.altKey ? app.rewind() : app.previousMarker()),
      ArrowRight: () => (e.altKey ? app.fastForward() : app.nextMarker()),
      // Up / down follow the Cue List order; with Option they move between pages.
      ArrowUp: () => (e.altKey ? app.selectAdjacentPage(-1) : app.previousMarker()),
      ArrowDown: () => (e.altKey ? app.selectAdjacentPage(1) : app.nextMarker()),
      Home: () => app.toStart(),
      // , and . sit in the same place on US and JIS keyboards (and match Logic Pro).
      Comma: () => app.rewind(),
      Period: () => app.fastForward(),
      // Esc fades out and stops, as in QLab; pressed again it stops at once.
      Escape: () => app.fadeOutStop(),
      // D ducks everything for an announcement; pressed again it comes back.
      KeyD: () => app.toggleDuck(),
    };
    // e.code keeps G / M working with a Japanese IME layout.
    const action = actions[e.code];
    if (!action) return;
    // GO and marker shortcuts must not fire repeatedly while a key is held.
    if (e.repeat && ['KeyG', 'KeyM', 'KeyF', 'KeyI', 'KeyO', 'KeyX', 'KeyD', 'Space'].includes(e.code)) return;
    e.preventDefault();
    // A focused button would otherwise also react to Space.
    if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
    action();
  });
}
