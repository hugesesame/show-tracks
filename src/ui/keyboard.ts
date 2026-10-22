import type { App } from '../app/app';
import { isEditing } from './dom';
import type { FileMenu } from './fileMenu';
import { toggleFullscreen } from './fullscreen';

export type ZoomControls = { zoomIn(): void; zoomOut(): void };

export function installKeyboard(app: App, zoom: ZoomControls, files: FileMenu): void {
  window.addEventListener('keydown', (e) => {
    // ⌘S saves, ⇧⌘S saves to a new file; they work while typing too.
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') {
      e.preventDefault();
      // Blurring commits a field being edited before the project is written.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      void (e.shiftKey ? files.saveAs() : files.save());
      return;
    }
    if (isEditing(e.target) || e.metaKey || e.ctrlKey) return;
    if (document.querySelector('dialog[open]')) return;

    // = / + zoom in, - zooms out. e.key first so a JIS keyboard's Shift+- ("=") zooms in;
    // e.code covers an active IME, where e.key is "Process".
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
      // Arrows jump between markers; with Option they rewind / fast forward.
      ArrowLeft: () => (e.altKey ? app.rewind() : app.previousMarker()),
      ArrowRight: () => (e.altKey ? app.fastForward() : app.nextMarker()),
      // Up / down follow the Cue List order; with Option they move between pages.
      ArrowUp: () => (e.altKey ? app.selectAdjacentPage(-1) : app.previousMarker()),
      ArrowDown: () => (e.altKey ? app.selectAdjacentPage(1) : app.nextMarker()),
      Home: () => app.toStart(),
      BracketLeft: () => app.rewind(),
      BracketRight: () => app.fastForward(),
      Escape: () => app.stop(),
    };
    // e.code keeps G / M working with a Japanese IME layout.
    const action = actions[e.code];
    if (!action) return;
    // GO and marker shortcuts must not fire repeatedly while a key is held.
    if (e.repeat && ['KeyG', 'KeyM', 'KeyF', 'Space'].includes(e.code)) return;
    e.preventDefault();
    // A focused button would otherwise also react to Space.
    if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
    action();
  });
}
