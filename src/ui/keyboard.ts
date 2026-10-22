import type { App } from '../app/app';
import { isEditing } from './dom';

export function installKeyboard(app: App): void {
  window.addEventListener('keydown', (e) => {
    if (isEditing(e.target) || e.metaKey || e.ctrlKey) return;
    if (document.querySelector('dialog[open]')) return;

    const actions: Record<string, () => void> = {
      Space: () => app.togglePlay(),
      KeyG: () => app.go(),
      KeyM: () => app.addMarkerAtPlayhead(),
      // Arrows jump between markers; with Option they rewind / fast forward.
      ArrowLeft: () => (e.altKey ? app.rewind() : app.previousMarker()),
      ArrowRight: () => (e.altKey ? app.fastForward() : app.nextMarker()),
      Home: () => app.toStart(),
      BracketLeft: () => app.rewind(),
      BracketRight: () => app.fastForward(),
      Escape: () => app.stop(),
    };
    // e.code keeps G / M working with a Japanese IME layout.
    const action = actions[e.code];
    if (!action) return;
    // GO and marker shortcuts must not fire repeatedly while a key is held.
    if (e.repeat && (e.code === 'KeyG' || e.code === 'KeyM' || e.code === 'Space')) return;
    e.preventDefault();
    // A focused button would otherwise also react to Space.
    if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
    action();
  });
}
