import type { App } from '../app/app';
import { APP_NAME } from '../config';
import { h } from './dom';

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

export function createFooter(app: App) {
  const play = h('button', { class: 'play', title: '再生 / 停止 (Space)', onclick: () => app.togglePlay() }, '▶');
  const element = h(
    'footer',
    { class: 'footer' },
    h('div'),
    h(
      'div',
      { class: 'transport' },
      h('button', { title: '頭出し (Home)', onclick: () => app.toStart() }, '⏮'),
      repeatButton('◀◀', '巻き戻し 5 秒 ([)', () => app.rewind()),
      play,
      repeatButton('▶▶', '早送り 5 秒 (])', () => app.fastForward()),
      h('button', { title: '前のマーカー', onclick: () => app.previousMarker() }, '|◀'),
      h('button', { title: '次のマーカー', onclick: () => app.nextMarker() }, '▶|'),
    ),
    h('div', { class: 'app-name' }, APP_NAME),
  );

  function update(): void {
    const playing = app.transport.playing;
    play.textContent = playing ? '■' : '▶';
    play.classList.toggle('playing', playing);
  }

  return { element, update };
}
