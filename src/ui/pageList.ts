import type { App } from '../app/app';
import type { EndAction, Page } from '../model/types';
import { editableCell } from './cueList';
import { h } from './dom';

const DELETE_CONFIRM_MS = 3000;

const END_ACTIONS: { action: EndAction; label: string; title: string }[] = [
  { action: 'stop', label: 'Stop', title: 'At the end: stop' },
  { action: 'next', label: 'Next', title: 'At the end: go to the next page and wait' },
  { action: 'nextPlay', label: 'Next ▶', title: 'At the end: play the next page' },
];
/** Pointer travel before a press on a row becomes a drag. */
const DRAG_START_PX = 4;

/** All pages: click to open one, double-click its name to rename. */
export function createPageList(app: App) {
  const list = h('div', { class: 'page-list' });
  const dropLine = h('div', { class: 'drop-line', hidden: true });

  // Two-step delete instead of a blocking confirm() dialog.
  let deleteArmed: ReturnType<typeof setTimeout> | undefined;
  const removeButton = h('button', { class: 'small', title: 'Delete page' }, '🗑');
  const disarm = () => {
    clearTimeout(deleteArmed);
    deleteArmed = undefined;
    removeButton.textContent = '🗑';
    removeButton.classList.remove('active');
  };
  removeButton.addEventListener('click', () => {
    if (deleteArmed) {
      disarm();
      app.removeCurrentPage();
      return;
    }
    removeButton.textContent = 'Delete?';
    removeButton.classList.add('active');
    deleteArmed = setTimeout(disarm, DELETE_CONFIRM_MS);
  });

  const element = h(
    'section',
    { class: 'panel' },
    h(
      'div',
      { class: 'panel-title' },
      h('span', {}, 'PAGES'),
      h(
        'div',
        { class: 'panel-actions' },
        h('button', { class: 'small', title: 'Add page', onclick: () => app.addPage() }, '+'),
        removeButton,
      ),
    ),
    list,
  );
  let renderedPages: Page[] | null = null;
  let justDragged = false;
  let dirty = false;

  function row(page: Page, index: number): HTMLElement {
    const name = editableCell(
      'name',
      page.name,
      (text) => text.trim() && app.renamePage(text.trim(), page.id),
      render,
    );
    const el = h(
      'div',
      { class: 'page-row', onclick: () => !justDragged && app.selectPage(page.id) },
      h('span', { class: 'num' }, String(index + 1)),
      name,
      endActionButton(page),
    );
    el.addEventListener('dblclick', () => name.dispatchEvent(new MouseEvent('dblclick')));
    makeDraggable(el, page.id);
    return el;
  }

  /** Moves the highlight without rebuilding, so a double click lands on the same element. */
  function updateCurrent(): void {
    const pages = app.project.pages;
    list.querySelectorAll('.page-row').forEach((el, i) => el.classList.toggle('current', pages[i].id === app.page.id));
    list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
    removeButton.disabled = pages.length === 1;
  }

  /** Cycles Stop → Next → Next ▶ for what happens at the end of the page. */
  function endActionButton(page: Page): HTMLButtonElement {
    const index = END_ACTIONS.findIndex((a) => a.action === page.endAction);
    const current = END_ACTIONS[index];
    return h(
      'button',
      {
        class: `end-action ${current.action}`,
        title: `${current.title} (click to change)`,
        onclick: (e: Event) => {
          e.stopPropagation();
          app.setEndAction(page.id, END_ACTIONS[(index + 1) % END_ACTIONS.length].action);
        },
        // Double-clicking the button must not start renaming the page.
        ondblclick: (e: Event) => e.stopPropagation(),
        onpointerdown: (e: Event) => e.stopPropagation(),
      },
      current.label,
    );
  }

  /** Where a page dropped at clientY lands, as an index in the list without it. */
  function dropIndex(clientY: number, draggedId: string): number {
    const rows = [...list.querySelectorAll<HTMLElement>('.page-row')].filter((r) => r.dataset.pageId !== draggedId);
    return rows.filter((r) => {
      const rect = r.getBoundingClientRect();
      return rect.top + rect.height / 2 < clientY;
    }).length;
  }

  function showDropLine(index: number, draggedId: string): void {
    const rows = [...list.querySelectorAll<HTMLElement>('.page-row')].filter((r) => r.dataset.pageId !== draggedId);
    const top = index < rows.length ? rows[index].offsetTop : rows.length ? rows[rows.length - 1].offsetTop + rows[rows.length - 1].offsetHeight : 0;
    dropLine.style.top = `${top - 1}px`;
    dropLine.hidden = false;
  }

  /** Press and drag a row to reorder; a press without moving stays a click. */
  function makeDraggable(el: HTMLElement, pageId: string): void {
    el.dataset.pageId = pageId;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('input')) return;
      const startY = e.clientY;
      let dragging = false;
      const move = (ev: PointerEvent) => {
        if (!dragging && Math.abs(ev.clientY - startY) < DRAG_START_PX) return;
        if (!dragging) {
          dragging = true;
          el.setPointerCapture(ev.pointerId);
          el.classList.add('dragging');
        }
        showDropLine(dropIndex(ev.clientY, pageId), pageId);
      };
      const up = (ev: PointerEvent) => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        if (!dragging) return;
        el.classList.remove('dragging');
        dropLine.hidden = true;
        // The click that follows a drag must not also select the page.
        justDragged = true;
        setTimeout(() => (justDragged = false));
        if (ev.type === 'pointerup') app.movePage(pageId, dropIndex(ev.clientY, pageId));
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }

  /** Only a field being typed in holds back a rebuild; a focused button does not. */
  const isTyping = () => document.activeElement instanceof HTMLInputElement && list.contains(document.activeElement);

  function render(): void {
    dirty = false;
    renderedPages = app.project.pages;
    list.replaceChildren(...renderedPages.map(row), dropLine);
    updateCurrent();
  }

  function update(): void {
    // Rebuilding while a name is being edited would throw the typing away.
    if (isTyping()) {
      dirty = true;
      return;
    }
    if (app.project.pages === renderedPages) updateCurrent();
    else render();
  }

  list.addEventListener('focusout', () => {
    queueMicrotask(() => {
      if (dirty && !isTyping()) render();
    });
  });

  return { element, update };
}
