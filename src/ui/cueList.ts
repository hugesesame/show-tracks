import type { App } from '../app/app';
import type { Marker } from '../model/types';
import { h } from './dom';
import { formatClock, parseClock } from './format';

/**
 * Text that turns into an input on double click.
 * Commits on Enter or blur, reverts on Escape; `done` runs either way.
 */
export function editableCell(
  className: string,
  value: string,
  commit: (text: string) => void,
  done: () => void,
): HTMLElement {
  const cell = h('span', { class: `cell ${className}`, title: 'Double-click to edit' }, value);
  cell.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startEditing(cell, value, commit, done);
  });
  return cell;
}

function startEditing(cell: HTMLElement, value: string, commit: (text: string) => void, done: () => void): void {
  if (cell.querySelector('input')) return;
  const input = h('input', { class: cell.className.replace('cell', '').trim(), value, spellcheck: false });
  let cancelled = false;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
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

export function createCueList(app: App) {
  const list = h('div', { class: 'cue-list' });
  const element = h('section', { class: 'panel' }, h('div', { class: 'panel-title' }, 'CUE LIST'), list);
  let renderedMarkers: Marker[] | null = null;
  let dirty = false;

  function row(marker: Marker, index: number): HTMLElement {
    const name = editableCell(
      'name',
      marker.name,
      (text) => text.trim() && app.renameMarker(marker.id, text.trim()),
      render,
    );
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
    const element = h(
      'div',
      { class: 'cue-row', onclick: () => app.selectCue(marker.id) },
      h('span', { class: 'arrow' }),
      h('span', { class: 'num' }, String(index + 1)),
      name,
      time,
      h(
        'button',
        {
          class: 'delete',
          title: 'Delete',
          onclick: (e: Event) => {
            e.stopPropagation();
            app.removeMarker(marker.id);
          },
        },
        '×',
      ),
    );
    element.dataset.markerId = marker.id;
    // Double-clicking elsewhere on the row edits the name.
    element.addEventListener('dblclick', () => name.dispatchEvent(new MouseEvent('dblclick')));
    return element;
  }

  /** Moves the highlight without rebuilding, so a double click lands on the same element. */
  function updateStandby(): void {
    const { standby } = app.cue;
    for (const el of list.querySelectorAll<HTMLElement>('.cue-row')) {
      const isStandby = standby.kind === 'cue' && standby.markerId === el.dataset.markerId;
      el.classList.toggle('standby', isStandby);
      el.querySelector('.arrow')!.textContent = isStandby ? '▶' : '';
    }
    list.querySelector('.standby')?.scrollIntoView({ block: 'nearest' });
  }

  /** Only a field being typed in holds back a rebuild; a focused button does not. */
  const isTyping = () => document.activeElement instanceof HTMLInputElement && list.contains(document.activeElement);

  function render(): void {
    dirty = false;
    const { markers } = app.page;
    renderedMarkers = markers;
    if (markers.length === 0) {
      list.replaceChildren(h('div', { class: 'cue-empty' }, 'No markers. Press M to add one at the playhead.'));
      return;
    }
    list.replaceChildren(...markers.map(row));
    updateStandby();
  }

  function update(): void {
    // Rebuilding while a field is focused would throw away what is being typed.
    if (isTyping()) {
      dirty = true;
      return;
    }
    if (app.page.markers === renderedMarkers) updateStandby();
    else render();
  }

  list.addEventListener('focusout', () => {
    queueMicrotask(() => {
      if (dirty && !isTyping()) render();
    });
  });

  return { element, update };
}
