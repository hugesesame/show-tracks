import type { App } from '../app/app';
import { FPS_OPTIONS, formatTimecode, parseTimecode, secondsToTimecode, timecodeToSeconds, type Fps } from '../engine/timecode';
import { storageEstimate } from '../storage/db';
import { h } from './dom';

const FPS_LABELS: Record<Fps, string> = { '24': '24', '25': '25', '29.97df': '29.97 DF', '30': '30' };

const formatBytes = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;

function row(label: string, ...controls: (Node | string)[]): HTMLElement {
  return h('label', { class: 'row' }, h('span', {}, label), h('div', {}, ...controls));
}

function download(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  h('a', { href: url, download: fileName }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createSettings(app: App) {
  const dialog = h('dialog');

  function render(): void {
    const { settings } = app.project;
    const page = app.page;

    const midiSelect = h(
      'select',
      { onchange: () => app.setMidiOutput(midiSelect.value || null) },
      h('option', { value: '' }, 'なし'),
      ...app.mtc.outputs().map((o) => h('option', { value: o.id, selected: o.id === settings.midiOutputId }, o.name)),
    );
    const midiHint = {
      on: '送信中',
      off: app.mtc.outputs().length === 0 ? '出力先がありません（Mac は Audio MIDI 設定で IAC ドライバを有効にしてください）' : '',
      denied: 'MIDI の使用が許可されていません。アドレスバーのサイト設定から許可してください',
      unsupported: 'このブラウザは Web MIDI に対応していません',
    }[app.mtc.status];

    const fpsSelect = h(
      'select',
      { onchange: () => app.setFps(fpsSelect.value as Fps) },
      ...FPS_OPTIONS.map((fps) => h('option', { value: fps, selected: fps === settings.mtcFps }, FPS_LABELS[fps])),
    );

    const pageName = h('input', {
      value: page.name,
      onchange: () => pageName.value.trim() && app.renamePage(pageName.value.trim()),
    });

    const offset = h('input', {
      value: formatTimecode(secondsToTimecode(0, settings.mtcFps, page.mtcOffset), settings.mtcFps),
      placeholder: '01:00:00:00',
      onchange: () => {
        const tc = parseTimecode(offset.value, settings.mtcFps);
        if (tc) app.setPageOffset(timecodeToSeconds(tc, settings.mtcFps));
        else {
          app.error('オフセットは 01:00:00:00 の形式で入力してください');
          render();
        }
      },
    });

    const videoAudio = h('input', {
      type: 'checkbox',
      checked: page.videoAudioEnabled,
      onchange: () => app.setVideoAudio(videoAudio.checked, Number(volume.value)),
    });
    const volume = h('input', {
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
      value: String(page.videoAudioVolume),
      oninput: () => app.setVideoAudio(videoAudio.checked, Number(volume.value)),
    });

    const importInput = h('input', {
      type: 'file',
      accept: 'application/json,.json',
      hidden: true,
      onchange: async () => {
        const file = importInput.files?.[0];
        if (!file) return;
        await app.importJson(await file.text());
        render();
      },
    });

    const usage = h('span', { class: 'hint' }, '計算中…');
    void storageEstimate().then((estimate) => {
      usage.textContent = estimate ? `${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)}` : '不明';
    });

    dialog.replaceChildren(
      h(
        'form',
        { class: 'settings', method: 'dialog' },
        h('h2', {}, '設定'),
        h('h3', {}, 'MTC'),
        row('MIDI 出力', midiSelect),
        midiHint ? h('div', { class: 'hint' }, midiHint) : null,
        row('フレームレート', fpsSelect),
        h('h3', {}, `このページ（${page.name}）`),
        row('ページ名', pageName),
        row('MTC オフセット', offset),
        row('映像の音を出す', videoAudio, ' ', volume),
        h('h3', {}, 'プロジェクト'),
        row(
          'ファイル',
          h('button', { type: 'button', onclick: () => download('cue-player-project.json', app.exportJson()) }, '書き出し'),
          ' ',
          h('button', { type: 'button', onclick: () => importInput.click() }, '読み込み'),
          importInput,
        ),
        h('div', { class: 'hint' }, '書き出したファイルには音声・映像は含まれません。読み込み後に各ページで選び直してください'),
        row('保存領域', usage),
        h('div', { class: 'actions' }, h('button', { value: 'close' }, '閉じる')),
      ),
    );
  }

  function open(): void {
    render();
    dialog.showModal();
  }

  return { element: dialog, open };
}
