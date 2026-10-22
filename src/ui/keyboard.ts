import type { App } from '../app/app';
import { isEditing } from './dom';

const NUDGE_SECONDS = 1;
const NUDGE_SECONDS_WITH_OPTION = 5;

export function installKeyboard(app: App): void {
  window.addEventListener('keydown', (e) => {
    if (isEditing(e.target) || e.metaKey || e.ctrlKey) return;
    if (document.querySelector('dialog[open]')) return;

    const actions: Record<string, () => void> = {
      Space: () => app.togglePlay(),
      KeyG: () => app.go(),
      KeyM: () => app.addMarkerAtPlayhead(),
      ArrowLeft: () => app.nudgeStandby(-(e.altKey ? NUDGE_SECONDS_WITH_OPTION : NUDGE_SECONDS)),
      ArrowRight: () => app.nudgeStandby(e.altKey ? NUDGE_SECONDS_WITH_OPTION : NUDGE_SECONDS),
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
