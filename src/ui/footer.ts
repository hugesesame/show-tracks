import type { App } from '../app/app';
import { APP_NAME } from '../config';
import { h } from './dom';
import { fileButtons, type FileMenu } from './fileMenu';

const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 150;

/** A button that acts once on press and keeps repeating while held. */
function repeatButton(label: string, title: string, action: () => void): HTMLButtonElement {
  const button = h('button', { title }, label);
  let delay: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    clearTimeout(delay);
    clearInterval(interval);
  };
  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    action();
    delay = setTimeout(() => {
      interval = setInterval(action, REPEAT_INTERVAL_MS);
    }, REPEAT_DELAY_MS);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(type, stop);
  // Keyboard activation (Enter on a focused button) still works once.
  button.addEventListener('click', (e) => {
    if (e.detail === 0) action();
  });
  return button;
}

export function createFooter(app: App, files: FileMenu) {
  const fileName = h('span', { class: 'file-name' });
  // Only Save sits here, the one file action needed during a show; the rest are in Settings.
  const save = fileButtons(files).save;
  const clock = h('div', { class: 'wall-clock', title: 'Current time' });
  const offline = h(
    'div',
    { class: 'offline-ready', hidden: true, title: 'A copy of the app is kept in this browser: it also opens without a connection' },
    'Offline ready',
  );
  const loop = h('button', { class: 'loop', title: 'Loop the page', onclick: () => app.toggleLoop() }, '🔁');
  const play = h('button', { class: 'play', title: 'Play / Stop (Space)', onclick: () => app.togglePlay() }, '▶');
  const fade = h('button', { class: 'fade', title: 'Fade out and stop (Esc); again to stop at once', onclick: () => app.fadeOutStop() }, 'Fade');
  const element = h(
    'footer',
    { class: 'footer' },
    h('div', { class: 'file-buttons' }, save, fileName),
    h(
      'div',
      { class: 'transport' },
      h('button', { title: 'Go to start (Home)', onclick: () => app.toStart() }, '⏮'),
      repeatButton('◀◀', 'Rewind 5s (⌥← / ,)', () => app.rewind()),
      play,
      fade,
      repeatButton('▶▶', 'Fast forward 5s (⌥→ / .)', () => app.fastForward()),
      h('button', { title: 'Previous marker (←)', onclick: () => app.previousMarker() }, '|◀'),
      h('button', { title: 'Next marker (→)', onclick: () => app.nextMarker() }, '▶|'),
      loop,
    ),
    h('div', { class: 'footer-right' }, offline, h('div', { class: 'app-name' }, APP_NAME), clock),
  );

  // The computer's time of day, for keeping to a running order.
  const showTime = () => {
    clock.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
    // The seconds left of a fade out, counted down on its button.
    const left = app.fadeRemaining;
    fade.textContent = left > 0 ? `${left.toFixed(1)}s` : 'Fade';
    fade.classList.toggle('fading', left > 0);
  };
  showTime();
  setInterval(showTime, 100);

  function update(): void {
    const playing = app.transport.playing;
    play.textContent = playing ? '■' : '▶';
    play.classList.toggle('playing', playing);
    loop.classList.toggle('active', app.transport.loop);
    loop.title = app.transport.loop ? 'Loop: on' : 'Loop: off';
    const unsaved = files.unsaved;
    fileName.textContent = `${files.fileName ?? 'Untitled'}${unsaved ? ' ●' : ''}`;
    fileName.title = unsaved ? 'Not saved to a file' : 'Saved';
    fileName.classList.toggle('unsaved', unsaved);
  }

  return { element, update, showOfflineReady: () => (offline.hidden = false) };
}
