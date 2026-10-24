import type { App } from '../app/app';
import { FPS_OPTIONS, formatTimecode, parseTimecode, secondsToTimecode, timecodeToSeconds, type Fps } from '../engine/timecode';
import { triggerLabel } from '../engine/midiRemote';
import type { RemoteAction } from '../model/types';
import { storageEstimate } from '../storage/db';
import { h } from './dom';
import { fileButtons, type FileMenu } from './fileMenu';
import { formatCountdown, parseClock } from './format';

const FPS_LABELS: Record<Fps, string> = { '24': '24', '25': '25', '29.97df': '29.97 DF', '30': '30' };

const REMOTE_ACTIONS: { action: RemoteAction; label: string }[] = [
  { action: 'go', label: 'GO' },
  { action: 'playStop', label: 'Play / Stop' },
  { action: 'fadeOut', label: 'Fade Out' },
  { action: 'previousCue', label: 'Previous Cue' },
  { action: 'nextCue', label: 'Next Cue' },
];

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
      'Show Names',
    );
    showNames.hidden = out.namesShown;
    const outputHint = !out.supported
      ? 'This browser cannot choose the audio output.'
      : out.missing
        ? 'The chosen device is not connected: the system default plays, and the sound goes back to the device when it is connected.'
        : out.namesShown
          ? 'All of the app’s sound plays through this device. It is remembered on this computer.'
          : 'Chrome shows device names once the microphone is allowed. Show Names asks once; nothing is recorded.';

    // The MIDI remote: an input, and the note or CC each control answers to.
    const inputSelect = h(
      'select',
      { onchange: () => app.setMidiInput(inputSelect.value || null) },
      h('option', { value: '' }, 'None'),
      ...app.mtc.inputs().map((i) => h('option', { value: i.id, selected: i.id === settings.midiInputId }, i.name)),
    );
    const inputName = app.mtc.inputs().find((i) => i.id === settings.midiInputId)?.name;
    const outputName = app.mtc.outputs().find((o) => o.id === settings.midiOutputId)?.name;
    const loopback = inputName !== undefined && inputName === outputName;
    const remoteRows = REMOTE_ACTIONS.map(({ action, label }) => {
      const trigger = settings.midiRemote[action];
      const learning = app.learningRemote === action;
      const learn = h(
        'button',
        {
          type: 'button',
          class: `small${learning ? ' active' : ''}`,
          title: 'Then press the key, pad or pedal on the MIDI device',
          onclick: () => {
            if (learning) app.cancelLearn();
            else void app.learnRemote(action).then(render);
            render();
          },
        },
        learning ? 'Press a key…' : 'Learn',
      );
      const clear = h('button', { type: 'button', class: 'small', title: 'Remove', onclick: () => { app.setRemote(action, null); render(); } }, '×');
      clear.hidden = !trigger;
      return row(label, h('span', { class: 'remote-trigger' }, trigger ? triggerLabel(trigger) : '—'), ' ', learn, ' ', clear);
    });

    // MTC from a DAW: the input it comes in on, and whether this page follows it.
    const mtcInputSelect = h(
      'select',
      {
        onchange: () => {
          app.setMtcInput(mtcInputSelect.value || null);
          render();
        },
      },
      h('option', { value: '' }, 'None'),
      ...app.mtc.inputs().map((i) => h('option', { value: i.id, selected: i.id === settings.mtcInputId }, i.name)),
    );
    const mtcInputHint = !settings.mtcInputId
      ? 'For pages that follow a DAW: choose the port the DAW sends MTC to (on a Mac, the IAC Driver).'
      : { waiting: 'No MTC has come in yet. Start the DAW with MTC output on.', running: 'MTC is coming in.', stopped: 'MTC has come in; the DAW is stopped.' }[app.mtcInState];

    // The list a page is in (Play or MTC In) decides whether it sends or follows MTC.
    const offsetHint = page.followMtc
      ? 'An MTC In page: the DAW runs it. It plays, stops and locates with the MTC coming in, starting at this timecode, and its cues send memos and MIDI Notes.'
      : 'This page sends MTC from its playback time, starting at this timecode.';

    const hasMedia = page.audioMediaId !== null || page.videoMediaId !== null;
    const blankLength = h('input', {
      value: formatCountdown(page.blankLength),
      placeholder: '05:00',
      onchange: () => {
        const seconds = parseClock(blankLength.value);
        if (seconds !== null && seconds >= 1) app.setBlankLength(Math.round(seconds));
        else {
          app.error('Enter the length as 05:00.');
          render();
        }
      },
    });

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
        row('MIDI Output', midiSelect),
        midiHint ? h('div', { class: 'hint' }, midiHint) : null,
        row('Frame Rate', fpsSelect),
        row('MTC Input', mtcInputSelect),
        h('div', { class: 'hint' }, mtcInputHint),
        h('h3', {}, 'MIDI Remote'),
        row('MIDI Input', inputSelect),
        ...remoteRows,
        h(
          'div',
          { class: 'hint' },
          loopback
            ? 'The input is the same port as the MIDI output: cue notes sent out could come back and run these controls. Use separate ports.'
            : 'Run the show from a foot switch, pad or desk: press Learn, then the key. Notes and CCs both work, also in show mode.',
        ),
        h('h3', {}, 'MIDI Note'),
        row('Channel', channelSelect),
        row('Note', numberField(settings.noteNumber, 0, 127, (n) => app.setNoteDefaults({ noteNumber: n }))),
        row('Velocity', numberField(settings.noteVelocity, 1, 127, (n) => app.setNoteDefaults({ noteVelocity: n }))),
        h('div', { class: 'hint' }, 'Sent to the MIDI output above when playback reaches a cue with MIDI on. Cues can have their own note in the Cue List.'),
        h('h3', {}, 'Playback'),
        row('Audio Output', outputSelect, ' ', showNames),
        h('div', { class: 'hint' }, outputHint),
        row('Fade Out (Esc)', fadeOut, ' seconds'),
        h('div', { class: 'hint' }, 'Esc fades everything out over this time, then stops. Press Esc again to stop at once.'),
        h('h3', {}, `This Page (${page.name})`),
        row('Page Name', pageName),
        row('MTC Offset', offset),
        h('div', { class: 'hint' }, offsetHint),
        hasMedia ? null : row('Length', blankLength),
        hasMedia ? null : h('div', { class: 'hint' }, 'Without audio or video, the page is a blank track this long, to put cues on.'),
        h('h3', {}, 'Project'),
        row('File', h('div', { class: 'file-buttons' }, ...Object.values(fileButtons(files, render)))),
        row(
          'Backup',
          h(
            'div',
            { class: 'file-buttons' },
            backupButton('Backup', 'Save the project and all its media into a folder', files.backup),
            backupButton('Restore', 'Open a backup folder: the project and its media together', files.restore),
            backupButton('Find Media', 'Look in a folder for missing media, by file name', files.findMedia),
          ),
        ),
        status,
        h('div', { class: 'hint' }, 'Save and Export write the project without its audio and video. Backup writes a folder with the project and its media, so Restore opens the show complete on another computer. Find Media fills in missing media from a folder of the original files.'),
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
    // Saving and closing stay; everything that changes the show is locked.
    dialog.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      if (!['Close', 'Export', 'Save', 'Backup'].includes(b.textContent ?? '')) b.disabled = true;
    });
    dialog.querySelector('h2')?.after(h('div', { class: 'hint' }, 'Show mode: settings are locked. Press SHOW twice to edit.'));
  }

  function open(): void {
    render();
    dialog.showModal();
  }

  return { element: dialog, open };
}
