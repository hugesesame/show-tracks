import type { App } from '../app/app';
import { inRange } from '../model/range';
import type { Marker } from '../model/types';
import { autoScrollButton, deleteButton, h } from './dom';
import { formatClock, parseClock } from './format';

/**
 * Text that turns into an input on double click.
 * Commits on Enter or blur, reverts on Escape; `done` runs either way.
 * A multiline cell edits in a text area where Shift+Enter starts a new line,
 * and shows its line breaks as ↵ while not editing.
 */
export function editableCell(
  className: string,
  value: string,
  commit: (text: string) => void,
  done: () => void,
  multiline = false,
): HTMLElement {
  const shown = multiline ? value.replace(/\n/g, ' ↵ ') : value;
  const cell = h('span', { class: `cell ${className}`, title: 'Double-click to edit' }, shown);
  cell.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startEditing(cell, value, commit, done, multiline);
  });
  return cell;
}

function startEditing(
  cell: HTMLElement,
  value: string,
  commit: (text: string) => void,
  done: () => void,
  multiline: boolean,
): void {
  if (cell.querySelector('input, textarea')) return;
  const props = { class: cell.className.replace('cell', '').trim(), value, spellcheck: false };
  const input: HTMLInputElement | HTMLTextAreaElement = multiline ? h('textarea', props) : h('input', props);
  if (input instanceof HTMLTextAreaElement) {
    // Grows with its lines while typing.
    const fit = () => (input.rows = Math.max(1, input.value.split('\n').length));
    input.addEventListener('input', fit);
    fit();
  }
  let cancelled = false;
  (input as HTMLElement).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
      e.preventDefault();
      input.blur();
    }
    if (e.key === 'Escape') {
      cancelled = true;
      input.blur();
    }
  });
  input.addEventListener('blur', () => {
    if (!cancelled && input.value !== value) commit(input.value);
    done();
  });
  // Clicks inside the field place the caret; they should not reselect the row.
  input.addEventListener('click', (e) => e.stopPropagation());
  cell.replaceChildren(input);
  input.focus();
  input.select();
}

const COLUMN_KEY = 'cue-player-cue-column';

type Column = 'title' | 'memo';

function loadColumn(): Column {
  try {
    return localStorage.getItem(COLUMN_KEY) === 'memo' ? 'memo' : 'title';
  } catch {
    return 'title';
  }
}

export function createCueList(app: App) {
  const list = h('div', { class: 'cue-list' });
  // The wide column shows either the cue names or their memos, so each gets the full width.
  let column = loadColumn();
  const columnTab = (value: Column, label: string) =>
    h('button', { type: 'button', class: 'small', 'data-column': value, onclick: () => showColumn(value) }, label);
  const columnTabs = h('div', { class: 'column-tabs' }, columnTab('title', 'Title'), columnTab('memo', 'Memo'));
  function showColumn(value: Column): void {
    column = value;
    try {
      localStorage.setItem(COLUMN_KEY, value);
    } catch {
      // Not remembering the column is fine.
    }
    for (const b of columnTabs.querySelectorAll<HTMLElement>('button')) {
      b.classList.toggle('active', b.dataset.column === value);
    }
    render();
  }
  const autoScroll = autoScrollButton('cue-player-cue-autoscroll');
  /** The row of the cue playing, marked as playback reaches it. */
  let currentId: string | null = null;
  const pageMidi = h('button', { class: 'small midi-toggle', onclick: () => app.toggleMidiNotes() }, 'MIDI');
  // Like PAGES: add at the playhead, delete the cue on standby.
  const removeButton = deleteButton('Delete the selected cue', () => {
    const { standby } = app.cue;
    if (standby.kind === 'cue') app.removeMarker(standby.markerId);
  });
  const element = h(
    'section',
    { class: 'panel' },
    h(
      'div',
      { class: 'panel-title' },
      h('div', { class: 'panel-heading' }, h('span', { class: 'cue-heading-label' }, 'CUE LIST'), columnTabs),
      h(
        'div',
        { class: 'panel-actions cue-actions' },
        autoScroll.button,
        pageMidi,
        h('button', { class: 'small', title: 'Add a cue at the playhead (M)', onclick: () => app.addMarkerAtPlayhead() }, '+'),
        removeButton,
      ),
    ),
    list,
  );
  let renderedMarkers: Marker[] | null = null;
  /** The default note the rows were drawn with; cues without their own note show it. */
  let renderedNote = -1;
  let dirty = false;

  function row(marker: Marker, index: number): HTMLElement {
    const name =
      column === 'memo'
        ? editableCell('name memo', marker.memo, (text) => app.setMarkerFields(marker.id, { memo: text }), render, true)
        : editableCell('name', marker.name, (text) => text.trim() && app.renameMarker(marker.id, text.trim()), render);
    if (column === 'memo') name.title = 'Double-click to edit; Shift+Enter starts a new line';
    const time = editableCell(
      'time',
      formatClock(marker.time),
      (text) => {
        const seconds = parseClock(text);
        if (seconds === null) app.error('Enter the time as 01:23.45.');
        else app.setMarkerTime(marker.id, seconds);
      },
      render,
    );
    const midi = h(
      'button',
      {
        class: `small midi-toggle${marker.midiOn ? ' on' : ''}`,
        title: marker.midiOn ? 'MIDI Note on: click to turn off' : 'MIDI Note off: click to turn on',
        onclick: (e: Event) => {
          e.stopPropagation();
          app.setMarkerFields(marker.id, { midiOn: !marker.midiOn });
        },
      },
      marker.midiOn ? 'On' : 'Off',
    );
    const note = editableCell(
      `note${marker.note === null ? ' default' : ''}`,
      String(marker.note ?? app.project.settings.noteNumber),
      (text) => {
        // Empty goes back to the default note.
        if (text.trim() === '') return app.setMarkerFields(marker.id, { note: null });
        const value = Number(text);
        if (Number.isInteger(value) && value >= 0 && value <= 127) app.setMarkerFields(marker.id, { note: value });
        else app.error('Enter a note number from 0 to 127.');
      },
      render,
    );
    note.title = 'MIDI Note number (double-click to edit, clear it for the default)';
    const element = h(
      'div',
      { class: 'cue-row', onclick: () => app.selectCue(marker.id) },
      h('span', { class: 'arrow' }),
      h('span', { class: 'num' }, String(index + 1)),
      name,
      time,
      midi,
      note,
    );
    element.dataset.markerId = marker.id;
    // Double-clicking elsewhere on the row edits the name.
    element.addEventListener('dblclick', () => name.dispatchEvent(new MouseEvent('dblclick')));
    return element;
  }

  /** Moves the highlight without rebuilding, so a double click lands on the same element. */
  function updateStandby(): void {
    const { standby } = app.cue;
    const page = app.page;
    for (const el of list.querySelectorAll<HTMLElement>('.cue-row')) {
      // Cues outside the in / out points are skipped by GO.
      const marker = page.markers.find((m) => m.id === el.dataset.markerId);
      el.classList.toggle('outside', marker !== undefined && !inRange(page, marker.time));
      const isStandby = standby.kind === 'cue' && standby.markerId === el.dataset.markerId;
      el.classList.toggle('standby', isStandby);
      el.querySelector('.arrow')!.textContent = isStandby ? '▶' : '';
    }
    if (autoScroll.isOn()) list.querySelector('.standby')?.scrollIntoView({ block: 'nearest' });
  }

  /** Only a field being typed in holds back a rebuild; a focused button does not. */
  const isTyping = () =>
    (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) &&
    list.contains(document.activeElement);

  function render(): void {
    dirty = false;
    const { markers } = app.page;
    renderedMarkers = markers;
    renderedNote = app.project.settings.noteNumber;
    if (markers.length === 0) {
      list.replaceChildren(h('div', { class: 'cue-empty' }, 'No markers. Press M to add one at the playhead.'));
      return;
    }
    list.replaceChildren(...markers.map(row));
    markCurrent();
    updateStandby();
  }

  function update(): void {
    // Rebuilding while a field is focused would throw away what is being typed.
    if (isTyping()) {
      dirty = true;
      return;
    }
    removeButton.disabled = app.cue.standby.kind !== 'cue';
    const { midiNotes } = app.page;
    pageMidi.classList.toggle('on', midiNotes);
    pageMidi.title = midiNotes ? "This page's MIDI Notes are on: click to turn them off" : "This page's MIDI Notes are off: click to turn them on";
    list.classList.toggle('midi-off', !midiNotes);
    if (app.page.markers === renderedMarkers && app.project.settings.noteNumber === renderedNote) updateStandby();
    else render();
  }

  list.addEventListener('focusout', () => {
    queueMicrotask(() => {
      if (dirty && !isTyping()) render();
    });
  });

  function markCurrent(): void {
    for (const el of list.querySelectorAll<HTMLElement>('.cue-row')) {
      el.classList.toggle('current', el.dataset.markerId === currentId);
    }
  }

  /** Call every frame: marks the cue playing, and keeps it in view with Auto on. */
  function tick(time: number): void {
    const id = app.cueAt(time);
    if (id === currentId) return;
    currentId = id;
    markCurrent();
    // The cue playing goes to the top, with the ones to come below it.
    if (autoScroll.isOn()) list.querySelector('.current')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  showColumn(column);

  return { element, update, tick };
}
