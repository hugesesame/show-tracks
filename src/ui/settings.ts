import type { App } from '../app/app';
import { FPS_OPTIONS, formatTimecode, parseTimecode, secondsToTimecode, timecodeToSeconds, type Fps } from '../engine/timecode';
import { storageEstimate } from '../storage/db';
import { h } from './dom';
import { fileButtons, type FileMenu } from './fileMenu';

const FPS_LABELS: Record<Fps, string> = { '24': '24', '25': '25', '29.97df': '29.97 DF', '30': '30' };

const formatBytes = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;

function row(label: string, ...controls: (Node | string)[]): HTMLElement {
  return h('label', { class: 'row' }, h('span', {}, label), h('div', {}, ...controls));
}

export function createSettings(app: App, files: FileMenu) {
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

    /** A whole number field for the note defaults; out-of-range input is refused. */
    const numberField = (value: number, min: number, max: number, set: (n: number) => void) => {
      const input = h('input', {
        class: 'number',
        type: 'number',
        min,
        max,
        value: String(value),
        onchange: () => {
          const n = Number(input.value);
          if (Number.isInteger(n) && n >= min && n <= max) set(n);
          else {
            app.error(`Enter a number from ${min} to ${max}.`);
            render();
          }
        },
      });
      return input;
    };
    const channelSelect = h(
      'select',
      { onchange: () => app.setNoteDefaults({ noteChannel: Number(channelSelect.value) }) },
      ...Array.from({ length: 16 }, (_, i) =>
        h('option', { value: String(i + 1), selected: i + 1 === settings.noteChannel }, String(i + 1)),
      ),
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
        h('h3', {}, 'MIDI Note'),
        row('Channel', channelSelect),
        row('Note', numberField(settings.noteNumber, 0, 127, (n) => app.setNoteDefaults({ noteNumber: n }))),
        row('Velocity', numberField(settings.noteVelocity, 1, 127, (n) => app.setNoteDefaults({ noteVelocity: n }))),
        h('div', { class: 'hint' }, 'Sent to the MIDI output above when playback reaches a cue with MIDI on. Cues can have their own note in the Cue List.'),
        h('h3', {}, `This page (${page.name})`),
        row('Page name', pageName),
        row('MTC offset', offset),
        h('h3', {}, 'Project'),
        row('File', h('div', { class: 'file-buttons' }, ...fileButtons(files, render))),
        h('div', { class: 'hint' }, 'Project files do not include audio or video. They stay in this browser; on another computer, re-select the media on each page.'),
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
