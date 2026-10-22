import type { App } from '../app/app';
import type { MediaRecord } from '../model/types';
import { h } from './dom';

function mediaSlot(app: App, kind: MediaRecord['kind'], label: string) {
  const input = h('input', {
    type: 'file',
    accept: kind === 'audio' ? 'audio/*' : 'video/*',
    hidden: true,
    onchange: () => {
      const file = input.files?.[0];
      input.value = '';
      if (file) void app.setMedia(kind, file);
    },
  });
  const name = h('span', { class: 'name' });
  const clear = h('button', { class: 'small', title: `Remove ${label.toLowerCase()}`, onclick: () => void app.clearMedia(kind) }, '×');
  const element = h(
    'div',
    { class: 'media-slot' },
    h('span', {}, label),
    name,
    h('button', { class: 'small', onclick: () => input.click() }, 'Choose'),
    clear,
    input,
  );

  function update(): void {
    const id = kind === 'audio' ? app.page.audioMediaId : app.page.videoMediaId;
    const media = app.mediaFor(id);
    const missing = id !== null && !media && app.missingMediaPageIds().includes(app.page.id);
    name.classList.toggle('missing', missing);
    if (media) name.textContent = media.fileName;
    else if (missing) name.textContent = `Missing (${app.importedMediaNames[id!] ?? 'original file'})`;
    else name.textContent = id ? 'Loading…' : 'None';
    name.title = name.textContent;
    clear.hidden = id === null;
  }

  return { element, update };
}

export function createMediaBar(app: App, openSettings: () => void) {
  const audio = mediaSlot(app, 'audio', 'Audio');
  const video = mediaSlot(app, 'video', 'Video');
  const outputButton = h('button', { class: 'small' });
  outputButton.addEventListener('click', () => {
    if (!app.output.open()) app.error('Could not open the output window. Please allow pop-ups.');
  });

  const element = h(
    'div',
    { class: 'media-bar' },
    audio.element,
    video.element,
    h('div', { class: 'spacer' }),
    outputButton,
    h('button', { class: 'small', onclick: openSettings }, '⚙ Settings'),
  );

  function update(): void {
    audio.update();
    video.update();
    const open = app.output.isOpen;
    outputButton.textContent = open ? 'Output open' : 'Open video output';
    outputButton.classList.toggle('active', open);
  }

  app.output.onChange(update);
  return { element, update };
}
