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
  /** The last backup, restore or media search message; kept across re-renders. */
  let statusText = '';
  let status = h('div', { class: 'hint backup-status' });
  const report = (message: string) => {
    statusText = message;
    status.textContent = message;
  };
  const backupButton = (label: string, title: string, action: (report: (m: string) => void) => Promise<void>) =>
    h('button', { type: 'button', title, onclick: async () => { await action(report); render(); } }, label);

  function render(): void {
    const { settings } = app.project;
    status = h('div', { class: 'hint backup-status' }, statusText);
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

    /** A number field, whole numbers unless `step` allows fractions; out-of-range input is refused. */
    const numberField = (value: number, min: number, max: number, set: (n: number) => void, step = 1) => {
      const input = h('input', {
        class: 'number',
        type: 'number',
        min,
        max,
        step,
        value: String(value),
        onchange: () => {
          const n = Number(input.value);
          const allowed = step === 1 ? Number.isInteger(n) : Number.isFinite(n);
          if (input.value !== '' && allowed && n >= min && n <= max) set(n);
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

    // The audio output belongs to this computer, not the project.
    const out = app.audioOutput;
    const outputSelect = h(
      'select',
      { onchange: () => void out.choose(outputSelect.value || null).then(render) },
      h('option', { value: '' }, 'System default'),
      ...out.devices.map((d) => h('option', { value: d.id, selected: d.id === out.chosen }, d.name)),
    );
    if (out.missing) {
      // Still listed, so the choice is not lost while the device is unplugged.
      outputSelect.append(h('option', { value: out.chosen!, selected: true }, 'Chosen device (not connected)'));
    }
    const showNames = h(
      'button',
      { type: 'button', class: 'small', onclick: () => void out.showNames().then(render) },
      'Show names',
    );
    showNames.hidden = out.namesShown;
    const outputHint = !out.supported
      ? 'This browser cannot choose the audio output.'
      : out.missing
        ? 'The chosen device is not connected: the system default plays, and the sound goes back to the device when it is connected.'
        : out.namesShown
          ? 'All of the app’s sound plays through this device. It is remembered on this computer.'
          : 'Chrome shows device names once the microphone is allowed. Show names asks once; nothing is recorded.';

    const fadeOut = numberField(settings.fadeOut, 0, 10, (n) => app.setFadeOut(n), 0.5);

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
        h('h3', {}, 'Playback'),
        row('Audio output', outputSelect, ' ', showNames),
        h('div', { class: 'hint' }, outputHint),
        row('Fade out (Esc)', fadeOut, ' seconds'),
        h('div', { class: 'hint' }, 'Esc fades everything out over this time, then stops. Press Esc again to stop at once.'),
        h('h3', {}, `This page (${page.name})`),
        row('Page name', pageName),
        row('MTC offset', offset),
        h('h3', {}, 'Project'),
        row('File', h('div', { class: 'file-buttons' }, ...Object.values(fileButtons(files, render)))),
        row(
          'Backup',
          h(
            'div',
            { class: 'file-buttons' },
            backupButton('Backup', 'Save the project and all its media into a folder', files.backup),
            backupButton('Restore', 'Open a backup folder: the project and its media together', files.restore),
            backupButton('Find media', 'Look in a folder for missing media, by file name', files.findMedia),
          ),
        ),
        status,
        h('div', { class: 'hint' }, 'Save and Export write the project without its audio and video. Backup writes a folder with the project and its media, so Restore opens the show complete on another computer. Find media fills in missing media from a folder of the original files.'),
        row('Storage', usage),
        h('div', { class: 'actions' }, h('button', { value: 'close' }, 'Close')),
      ),
    );
    lockForShow();
  }

  /** Show mode locks the settings: only the file buttons for saving stay. */
  function lockForShow(): void {
    if (!app.showMode) return;
    dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((c) => (c.disabled = true));
    dialog.querySelectorAll<HTMLButtonElement>('.file-buttons button').forEach((b) => {
      if (['New', 'Import', 'Restore', 'Find media'].includes(b.textContent ?? '')) b.disabled = true;
    });
    dialog.querySelector('h2')?.after(h('div', { class: 'hint' }, 'Show mode: settings are locked. Press SHOW twice to edit.'));
  }

  function open(): void {
    render();
    dialog.showModal();
  }

  return { element: dialog, open };
}
