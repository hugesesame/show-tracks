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
      h('option', { value: '' }, 'None'),
      ...app.mtc.outputs().map((o) => h('option', { value: o.id, selected: o.id === settings.midiOutputId }, o.name)),
    );
    const midiHint = {
      on: 'Sending',
      off: app.mtc.outputs().length === 0 ? 'No MIDI outputs. On a Mac, enable the IAC Driver in Audio MIDI Setup.' : '',
      denied: 'MIDI access is blocked. Allow it from the site settings in the address bar.',
      unsupported: 'This browser does not support Web MIDI.',
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
          app.error('Enter the offset as 01:00:00:00.');
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

    const usage = h('span', { class: 'hint' }, 'Calculating…');
    void storageEstimate().then((estimate) => {
      usage.textContent = estimate ? `${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)}` : 'Unknown';
    });

    dialog.replaceChildren(
      h(
        'form',
        { class: 'settings', method: 'dialog' },
        h('h2', {}, 'Settings'),
        h('h3', {}, 'MTC'),
        row('MIDI output', midiSelect),
        midiHint ? h('div', { class: 'hint' }, midiHint) : null,
        row('Frame rate', fpsSelect),
        h('h3', {}, `This page (${page.name})`),
        row('Page name', pageName),
        row('MTC offset', offset),
        row('Video sound', videoAudio, ' ', volume),
        h('h3', {}, 'Project'),
        row(
          'File',
          h('button', { type: 'button', onclick: () => download('cue-player-project.json', app.exportJson()) }, 'Export'),
          ' ',
          h('button', { type: 'button', onclick: () => importInput.click() }, 'Import'),
          importInput,
        ),
        h('div', { class: 'hint' }, 'Exported files do not include audio or video. Re-select the media on each page after importing.'),
        row('Storage', usage),
        h('div', { class: 'actions' }, h('button', { value: 'close' }, 'Close')),
      ),
    );
  }

  function open(): void {
    render();
    dialog.showModal();
  }

  return { element: dialog, open };
}
