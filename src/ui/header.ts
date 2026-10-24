import type { App } from '../app/app';
import { formatTimecode, secondsToTimecode } from '../engine/timecode';
import { nextPage, pageKind, pagesOfKind } from '../model/project';
import { h } from './dom';
import { formatClock, formatCountdown } from './format';
import { toggleFullscreen } from './fullscreen';

export function createHeader(app: App) {
  // "▶ STANDBY" under GO says what it does: play the cue on standby, named to its right.
  const go = h(
    'button',
    { class: 'go', title: 'GO: play from the cue on standby (G)', onclick: () => app.go() },
    h('span', { class: 'go-label' }, 'GO'),
    h('span', { class: 'go-hint' }, '▶ STANDBY'),
  );
  const standbyName = h('div', { class: 'standby-name' });
  const pageNumber = h('div', { class: 'page-number' });
  const pageName = h('div', { class: 'page-name' });

  const mtcIndicator = h('div', { class: 'mtc' });
  const tc = h('div', { class: 'readout-value' });
  const remaining = h('div', { class: 'readout-value' });
  const total = h('div', { class: 'readout-value' });
  const readout = (label: Node | string, value: HTMLElement, props = {}) =>
    h('div', { class: 'readout', ...props }, h('div', { class: 'readout-label' }, label), value);

  const element = h(
    'header',
    { class: 'header' },
    h(
      'div',
      { class: 'header-left' },
      go,
      // STANDBY takes the free room; the page sits on its right, next to the readouts.
      h('div', { class: 'header-standby' }, h('div', { class: 'standby-label' }, 'STANDBY'), standbyName),
      h('div', { class: 'page-info' }, pageNumber, pageName),
    ),
    h(
      'div',
      { class: 'header-right' },
      readout(mtcIndicator, tc, { title: 'Double-click for fullscreen', ondblclick: () => toggleFullscreen() }),
      readout('REMAINING', remaining),
      readout('TOTAL', total),
    ),
  );

  function standbyText(): string {
    const { standby } = app.cue;
    switch (standby.kind) {
      case 'cue':
        return app.page.markers.find((m) => m.id === standby.markerId)?.name ?? '—';
      case 'pageStart':
        return 'Page start';
      case 'nextPage':
        return `Next page ▶ ${nextPage(app.project, app.cue.pageId)?.name ?? ''}`;
      case 'none':
        return '—';
    }
  }

  function update(): void {
    standbyName.textContent = standbyText();
    go.disabled = app.cue.standby.kind === 'none';

    // Numbered within its list, as in PAGES.
    const mtcIn = pageKind(app.page) === 'mtc';
    const index = pagesOfKind(app.project, pageKind(app.page)).indexOf(app.page);
    pageNumber.textContent = `${mtcIn ? 'MTC IN · ' : ''}PAGE ${index + 1}`;
    pageName.textContent = app.page.name;

    showMtc();
  }

  /** Sending MTC, or on a page that follows a DAW, whether its MTC is coming in. */
  let shownMtc = '';
  function showMtc(): void {
    const status = app.mtc.status;
    let [className, text, title] = [
      `mtc ${status}`,
      // OUT pairs with IN on pages that follow a DAW; ■ means nothing is going out.
      { on: 'MTC OUT', off: 'MTC OUT ■', denied: 'MTC BLOCKED', unsupported: 'MTC N/A' }[status],
      {
        on: 'Sending MTC to the MIDI output.',
        off: 'Not sending MTC: choose a MIDI output in Settings.',
        denied: 'MIDI access is blocked. Allow it in the browser site settings.',
        unsupported: 'This browser does not support Web MIDI. Please use Chrome.',
      }[status],
    ];
    if (app.following && status !== 'denied' && status !== 'unsupported') {
      const state = app.project.settings.mtcInputId ? app.mtcInState : null;
      // Red as the playhead: the DAW is running the page now. Sending stays green.
      className = `mtc ${state === 'running' ? 'in' : 'off'}`;
      text = state === 'running' ? 'MTC IN' : 'MTC IN ■';
      title = !state
        ? 'This page follows MTC from a DAW: choose the MTC input in Settings.'
        : state === 'running'
          ? 'Following the MTC coming in from the DAW.'
          : 'This page follows MTC from a DAW; none is coming in now.';
    }
    const key = `${className}|${text}|${title}`;
    if (key === shownMtc) return;
    shownMtc = key;
    mtcIndicator.className = className;
    mtcIndicator.textContent = text;
    mtcIndicator.title = title;
  }

  function tick(time: number): void {
    showMtc();
    const { mtcFps } = app.project.settings;
    tc.textContent = formatTimecode(secondsToTimecode(time, mtcFps, app.page.mtcOffset), mtcFps);
    // Whole seconds counting down to 00:00 at the out point.
    const { start, end } = app.range;
    remaining.textContent = formatCountdown(Math.max(end - time, 0));
    total.textContent = formatClock(end - start);
  }


  return { element, update, tick };
}
