import type { App } from '../app/app';
import type { Page } from '../model/types';
import { editableCell } from './cueList';
import { h } from './dom';

const DELETE_CONFIRM_MS = 3000;

/** All pages: click to open one, double-click its name to rename. */
export function createPageList(app: App) {
  const list = h('div', { class: 'page-list' });
  const moveUp = h('button', { class: 'small', title: 'Move page up', onclick: () => app.movePage(-1) }, '↑');
  const moveDown = h('button', { class: 'small', title: 'Move page down', onclick: () => app.movePage(1) }, '↓');

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
        moveUp,
        moveDown,
        removeButton,
      ),
    ),
    list,
  );
  let renderedPages: Page[] | null = null;
  let dirty = false;

  function row(page: Page, index: number): HTMLElement {
    const name = editableCell(
      'name',
      page.name,
      (text) => text.trim() && app.renamePage(text.trim(), page.id),
      render,
    );
    const cues = page.markers.length;
    const el = h(
      'div',
      { class: 'page-row', onclick: () => app.selectPage(page.id) },
      h('span', { class: 'num' }, String(index + 1)),
      name,
      h('span', { class: 'count' }, cues === 1 ? '1 cue' : `${cues} cues`),
    );
    el.addEventListener('dblclick', () => name.dispatchEvent(new MouseEvent('dblclick')));
    return el;
  }

  /** Moves the highlight without rebuilding, so a double click lands on the same element. */
  function updateCurrent(): void {
    const pages = app.project.pages;
    list.querySelectorAll('.page-row').forEach((el, i) => el.classList.toggle('current', pages[i].id === app.page.id));
    list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
    const index = pages.findIndex((p) => p.id === app.page.id);
    moveUp.disabled = index <= 0;
    moveDown.disabled = index >= pages.length - 1;
    removeButton.disabled = pages.length === 1;
  }

  function render(): void {
    dirty = false;
    renderedPages = app.project.pages;
    list.replaceChildren(...renderedPages.map(row));
    updateCurrent();
  }

  function update(): void {
    // Rebuilding while a name is being edited would throw the typing away.
    if (list.contains(document.activeElement)) {
      dirty = true;
      return;
    }
    if (app.project.pages === renderedPages) updateCurrent();
    else render();
  }

  list.addEventListener('focusout', () => {
    queueMicrotask(() => {
      if (dirty && !list.contains(document.activeElement)) render();
    });
  });

  return { element, update };
}
