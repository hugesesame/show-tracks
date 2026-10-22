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
  const clear = h('button', { class: 'small', title: `${label}を外す`, onclick: () => void app.clearMedia(kind) }, '×');
  const element = h(
    'div',
    { class: 'media-slot' },
    h('span', {}, label),
    name,
    h('button', { class: 'small', onclick: () => input.click() }, '選択'),
    clear,
    input,
  );

  function update(): void {
    const id = kind === 'audio' ? app.page.audioMediaId : app.page.videoMediaId;
    const media = app.mediaFor(id);
    const missing = id !== null && !media && app.missingMediaPageIds().includes(app.page.id);
    name.classList.toggle('missing', missing);
    if (media) name.textContent = media.fileName;
    else if (missing) name.textContent = `未設定（${app.importedMediaNames[id!] ?? '元のファイル'}）`;
    else name.textContent = id ? '読み込み中…' : 'なし';
    name.title = name.textContent;
    clear.hidden = id === null;
  }

  return { element, update };
}

export function createMediaBar(app: App, openSettings: () => void) {
  const audio = mediaSlot(app, 'audio', '音声');
  const video = mediaSlot(app, 'video', '映像');
  const outputButton = h('button', { class: 'small' });
  outputButton.addEventListener('click', () => {
    if (!app.output.open()) app.error('映像出力のウィンドウを開けませんでした。ポップアップを許可してください');
  });

  const element = h(
    'div',
    { class: 'media-bar' },
    audio.element,
    video.element,
    h('div', { class: 'spacer' }),
    outputButton,
    h('button', { class: 'small', onclick: openSettings }, '⚙ 設定'),
  );

  function update(): void {
    audio.update();
    video.update();
    const open = app.output.isOpen;
    outputButton.textContent = open ? '映像出力中' : '映像出力を開く';
    outputButton.classList.toggle('active', open);
  }

  app.output.onChange(update);
  return { element, update };
}
