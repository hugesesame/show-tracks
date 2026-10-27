import type { App } from '../app/app';
import { pageKind, pagesOfKind, type PageKind } from '../model/project';
import type { EndAction, Page } from '../model/types';
import { editableCell } from './cueList';
import { autoScrollButton, deleteButton, h } from './dom';
import { formatCountdown } from './format';

const END_ACTIONS: { action: EndAction; label: string; title: string }[] = [
  { action: 'stop', label: 'Stop', title: 'At the end: stop' },
  { action: 'next', label: 'Next', title: 'At the end: go to the next page and wait' },
  { action: 'nextPlay', label: 'Next ▶', title: 'At the end: play the next page' },
];
/** Pointer travel before a press on a row becomes a drag. */
const DRAG_START_PX = 4;

/**
 * The pages of one list, Play or MTC In: click to open one, double-click its name to rename.
 * Play pages play their own media; MTC In pages follow the MTC from a DAW.
 */
export function createPageList(app: App, openHelp: () => void) {
  const list = h('div', { class: 'page-list' });
  const dropLine = h('div', { class: 'drop-line', hidden: true });
  const empty = h('div', { class: 'page-list-empty' }, 'No MTC In pages yet. Press + to add one: a blank track that follows the MTC from a DAW.');
  const loopButton = h('button', { class: 'small loop-pages', onclick: () => app.toggleLoopPages() }, 'Loop All');

  const removeButton = deleteButton('Delete page', () => app.removeCurrentPage());
  const autoScroll = autoScrollButton('cue-player-page-autoscroll');
  const total = h('span', { class: 'play-list-time' });
  /** The list shown; it follows the page opened, and the tabs switch it. */
  let kind: PageKind = pageKind(app.page);
  let shownPageId = app.page.id;
  /** The page last open in each list, to come back to. */
  const lastPage: Partial<Record<PageKind, string>> = { [kind]: shownPageId };
  const addButton = h('button', { class: 'small', onclick: () => app.addPage(kind) }, '+');
  const tab = (value: PageKind, label: string, title: string) =>
    h('button', { type: 'button', class: 'small', 'data-kind': value, title, onclick: () => showList(value) }, label);
  const tabs = h(
    'div',
    { class: 'column-tabs' },
    tab('play', 'Play', 'Pages that play their own audio and video, and send MTC'),
    tab('mtc', 'MTC In', 'Pages that follow the MTC from a DAW, which plays the sound'),
  );

  /** Shows a list, opening the page last open there (or its first page). */
  function showList(value: PageKind): void {
    kind = value;
    const pages = pagesOfKind(app.project, value);
    const target = pages.find((p) => p.id === lastPage[value]) ?? pages[0];
    if (target && target.id !== app.page.id) app.selectPage(target.id);
    else render();
  }
  /** The page last brought to the top, so the list is only scrolled when the page changes. */
  let scrolledTo: string | null = null;

  const element = h(
    'section',
    { class: 'panel' },
    h(
      'div',
      { class: 'panel-title' },
      h('div', { class: 'panel-heading' }, h('span', {}, 'PAGES'), tabs),
      h(
        'div',
        { class: 'panel-actions' },
        autoScroll.button,
        loopButton,
        addButton,
        removeButton,
      ),
    ),
    list,
    // Help sits at the bottom of the pages, out of the way of the show.
    h('div', { class: 'panel-footer' }, h('button', { class: 'small', title: 'Help (?)', onclick: openHelp }, '? Help'), total),
  );
  let renderedPages: Page[] | null = null;
  let renderedKind: PageKind | null = null;
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
      // MTC In pages end where the DAW goes: they have no end action.
      page.followMtc ? null : endActionButton(page),
    );
    el.addEventListener('dblclick', () => name.dispatchEvent(new MouseEvent('dblclick')));
    makeDraggable(el, page.id);
    return el;
  }

  /** Moves the highlight without rebuilding, so a double click lands on the same element. */
  function updateCurrent(): void {
    const pages = pagesOfKind(app.project, kind);
    list.querySelectorAll('.page-row').forEach((el, i) => el.classList.toggle('current', pages[i].id === app.page.id));
    // The page playing goes to the top, with the pages to come below it.
    if (autoScroll.isOn() && scrolledTo !== app.page.id) {
      scrolledTo = app.page.id;
      list.querySelector('.current')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    // Show mode locks editing; its buttons are shown as unavailable.
    const show = app.showMode;
    addButton.disabled = loopButton.disabled = show;
    removeButton.disabled = show || app.project.pages.length === 1 || pageKind(app.page) !== kind;
    // Looping the pages is for the Play list; the DAW runs the MTC In pages.
    loopButton.hidden = kind === 'mtc';
    // The running time is the Play list's: the DAW sets how long the MTC In pages run.
    total.hidden = kind === 'mtc';
    const time = app.playListTime();
    total.textContent = `Total ${formatCountdown(time.seconds)}${time.unknown ? ' +?' : ''}`;
    total.title = time.unknown
      ? 'The Play list played through, to the overlap marks. Some media is missing, so its length is left out'
      : 'The Play list played through: each page from its in to its out point, or to its overlap mark';
    addButton.title = kind === 'mtc' ? 'Add an MTC In page' : 'Add page';
    for (const b of tabs.querySelectorAll<HTMLElement>('button')) b.classList.toggle('active', b.dataset.kind === kind);
    list.querySelectorAll<HTMLButtonElement>('.end-action:not(.mtc)').forEach((b) => (b.disabled = show));
    const looping = app.project.settings.loopPages;
    loopButton.classList.toggle('active', looping);
    loopButton.title = looping ? 'Loop all pages: on (after the last page comes the first)' : 'Loop all pages: off';
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
      if (e.button !== 0 || (e.target as HTMLElement).closest('input') || app.showMode) return;
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
    renderedKind = kind;
    const pages = pagesOfKind(app.project, kind);
    list.replaceChildren(...pages.map(row), dropLine, ...(pages.length ? [] : [empty]));
    updateCurrent();
  }

  function update(): void {
    // Rebuilding while a name is being edited would throw the typing away.
    if (isTyping()) {
      dirty = true;
      return;
    }
    // Opening a page of the other list (GO, a delete, Undo) shows that list.
    if (app.page.id !== shownPageId) {
      shownPageId = app.page.id;
      lastPage[pageKind(app.page)] = app.page.id;
      if (pageKind(app.page) !== kind) {
        kind = pageKind(app.page);
        return render();
      }
    }
    if (app.project.pages === renderedPages && kind === renderedKind) updateCurrent();
    else render();
  }

  list.addEventListener('focusout', () => {
    queueMicrotask(() => {
      if (dirty && !isTyping()) render();
    });
  });

  return { element, update };
}
