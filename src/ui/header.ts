import type { App } from '../app/app';
import { formatTimecode, secondsToTimecode } from '../engine/timecode';
import { h } from './dom';
import { formatClock } from './format';
import { toggleFullscreen } from './fullscreen';

const DELETE_CONFIRM_MS = 3000;

export function createHeader(app: App) {
  const go = h('button', { class: 'go', title: 'GO (G)', onclick: () => app.go() }, 'GO');
  const standbyName = h('div', { class: 'standby-name' });
  const pageSelect = h('select', {
    title: 'Page',
    onchange: () => {
      app.selectPage(pageSelect.value);
      // Hand the keyboard back to the shortcuts.
      pageSelect.blur();
    },
  });
  const moveLeft = h('button', { title: 'Move page left', onclick: () => app.movePage(-1) }, '◀');
  const moveRight = h('button', { title: 'Move page right', onclick: () => app.movePage(1) }, '▶');

  // Two-step delete instead of a blocking confirm() dialog.
  let deleteArmed: ReturnType<typeof setTimeout> | undefined;
  const removeButton = h('button', { title: 'Delete page' }, '🗑');
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

  const mtcIndicator = h('div', { class: 'mtc' });
  const tc = h('div', { class: 'tc' });
  const elapsed = h('div', { class: 'elapsed' });
  const fullscreenButton = h('button', { class: 'fullscreen', onclick: () => toggleFullscreen() });
  const updateFullscreen = () => {
    const on = document.fullscreenElement !== null;
    fullscreenButton.textContent = on ? '🗗' : '⛶';
    fullscreenButton.title = on ? 'Exit fullscreen' : 'Fullscreen';
  };
  document.addEventListener('fullscreenchange', updateFullscreen);
  updateFullscreen();

  const element = h(
    'header',
    { class: 'header' },
    h(
      'div',
      { class: 'header-left' },
      go,
      h('div', { class: 'standby' }, h('div', { class: 'standby-label' }, 'STANDBY'), standbyName),
    ),
    h(
      'div',
      { class: 'pages' },
      pageSelect,
      h('button', { title: 'Add page', onclick: () => app.addPage() }, '＋'),
      moveLeft,
      moveRight,
      removeButton,
    ),
    h(
      'div',
      { class: 'header-right' },
      mtcIndicator,
      h('div', { class: 'clock', title: 'Double-click for fullscreen', ondblclick: () => toggleFullscreen() }, tc, elapsed),
      fullscreenButton,
    ),
  );

  function standbyText(): string {
    const { standby } = app.cue;
    const pages = app.project.pages;
    switch (standby.kind) {
      case 'cue':
        return app.page.markers.find((m) => m.id === standby.markerId)?.name ?? '—';
      case 'pageStart':
        return 'Page start';
      case 'nextPage': {
        const index = pages.findIndex((p) => p.id === app.cue.pageId);
        return `Next page ▶ ${pages[index + 1]?.name ?? ''}`;
      }
      case 'none':
        return '—';
    }
  }

  function update(): void {
    standbyName.textContent = standbyText();
    go.disabled = app.cue.standby.kind === 'none';

    const pages = app.project.pages;
    pageSelect.replaceChildren(
      ...pages.map((p, i) => h('option', { value: p.id, selected: p.id === app.page.id }, `${i + 1}. ${p.name}`)),
    );
    const index = pages.findIndex((p) => p.id === app.page.id);
    moveLeft.disabled = index <= 0;
    moveRight.disabled = index >= pages.length - 1;
    removeButton.disabled = pages.length === 1;

    const status = app.mtc.status;
    mtcIndicator.className = `mtc ${status}`;
    mtcIndicator.textContent = {
      on: 'MTC ON',
      off: 'MTC OFF',
      denied: 'MTC BLOCKED',
      unsupported: 'MTC N/A',
    }[status];
    mtcIndicator.title =
      status === 'denied'
        ? 'MIDI access is blocked. Allow it in the browser site settings.'
        : status === 'unsupported'
          ? 'This browser does not support Web MIDI. Please use Chrome.'
          : '';
  }

  function tick(time: number): void {
    const { mtcFps } = app.project.settings;
    tc.textContent = formatTimecode(secondsToTimecode(time, mtcFps, app.page.mtcOffset), mtcFps);
    elapsed.textContent = `${formatClock(time)} / ${formatClock(app.duration)}`;
  }

  return { element, update, tick };
}
