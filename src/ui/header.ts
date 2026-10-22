import type { App } from '../app/app';
import { formatTimecode, secondsToTimecode } from '../engine/timecode';
import { nextPage } from '../model/project';
import { h } from './dom';
import { formatClock } from './format';
import { toggleFullscreen } from './fullscreen';

export function createHeader(app: App) {
  const go = h('button', { class: 'go', title: 'GO (G)', onclick: () => app.go() }, 'GO');
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
      h('div', { class: 'standby' }, h('div', { class: 'standby-label' }, 'STANDBY'), standbyName),
      h('div', { class: 'page-info' }, pageNumber, pageName),
    ),
    readout(mtcIndicator, tc, { title: 'Double-click for fullscreen', ondblclick: () => toggleFullscreen() }),
    h(
      'div',
      { class: 'header-right' },
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

    const pages = app.project.pages;
    const index = pages.findIndex((p) => p.id === app.page.id);
    pageNumber.textContent = `PAGE ${index + 1} / ${pages.length}`;
    pageName.textContent = app.page.name;

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
    // Remaining time counts down, with a minus sign as on most playback devices.
    remaining.textContent = `-${formatClock(Math.max(0, app.duration - time))}`;
    total.textContent = formatClock(app.duration);
  }


  return { element, update, tick };
}
