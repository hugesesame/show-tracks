import type { App } from '../app/app';
import type { Marker } from '../model/types';
import { h } from './dom';
import { formatClock, parseClock } from './format';

/** Commits on Enter or blur, reverts on Escape. */
function editableInput(className: string, value: string, commit: (text: string) => void): HTMLInputElement {
  const input = h('input', { class: className, value, spellcheck: false });
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
    cancelled = false;
  });
  // Typing in the field should not select or seek the row.
  input.addEventListener('dblclick', (e) => e.stopPropagation());
  return input;
}

export function createCueList(app: App) {
  const list = h('div', { class: 'cue-list' });
  const element = h('section', { class: 'panel' }, h('div', { class: 'panel-title' }, 'CUE LIST'), list);
  let dirty = false;

  function row(marker: Marker, index: number): HTMLElement {
    const { standby } = app.cue;
    const isStandby = standby.kind === 'cue' && standby.markerId === marker.id;
    const name = editableInput('name', marker.name, (text) => {
      if (text.trim()) app.renameMarker(marker.id, text.trim());
      else render();
    });
    const time = editableInput('time', formatClock(marker.time), (text) => {
      const seconds = parseClock(text);
      if (seconds === null) {
        app.error('時間は 01:23.45 の形式で入力してください');
        render();
      } else app.setMarkerTime(marker.id, seconds);
    });
    return h(
      'div',
      {
        class: `cue-row${isStandby ? ' standby' : ''}`,
        onclick: () => app.selectCue(marker.id),
        ondblclick: () => app.seekToCue(marker.id),
      },
      h('span', { class: 'arrow' }, isStandby ? '▶' : ''),
      h('span', { class: 'num' }, String(index + 1)),
      name,
      time,
      h(
        'button',
        {
          class: 'delete',
          title: '削除',
          onclick: (e: Event) => {
            e.stopPropagation();
            app.removeMarker(marker.id);
          },
        },
        '×',
      ),
    );
  }

  function render(): void {
    dirty = false;
    const { markers } = app.page;
    if (markers.length === 0) {
      list.replaceChildren(h('div', { class: 'cue-empty' }, 'マーカーがありません。M キーで再生位置に追加できます'));
      return;
    }
    list.replaceChildren(...markers.map(row));
    list.querySelector('.standby')?.scrollIntoView({ block: 'nearest' });
  }

  function update(): void {
    // Rebuilding while a field is focused would throw away what is being typed.
    if (list.contains(document.activeElement)) {
      dirty = true;
      return;
    }
    render();
  }

  list.addEventListener('focusout', () => {
    queueMicrotask(() => {
      if (dirty && !list.contains(document.activeElement)) render();
    });
  });

  return { element, update };
}
