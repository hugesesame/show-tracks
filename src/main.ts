import './style.css';
import { App } from './app/app';
import { createProject } from './model/project';
import type { RemoteAction, Settings } from './model/types';
import { enableOffline } from './offline';
import { loadProject, openDb, requestPersistentStorage, saveProject, takeStashed } from './storage/db';
import { createCueList, setEditGuard } from './ui/cueList';
import { byId, h } from './ui/dom';
import { createFileMenu } from './ui/fileMenu';
import { createFooter } from './ui/footer';
import { keepEscapeInFullscreen } from './ui/fullscreen';
import { createHeader } from './ui/header';
import { installKeyboard } from './ui/keyboard';
import { createSplitters } from './ui/layout';
import { createHelp } from './ui/help';
import { createMediaBar } from './ui/mediaBar';
import { createMemoStage } from './ui/memoStage';
import { createMemoView } from './ui/memoView';
import { createMixer } from './ui/mixer';
import { createOtherTabsWarning } from './ui/otherTabs';
import { createPageList } from './ui/pageList';
import { createSettings } from './ui/settings';
import { createTrack } from './ui/track';

const TOAST_MS = 6000;

function showToast(container: HTMLElement, message: string): void {
  const toast = h('div', { class: 'toast' }, message);
  container.append(toast);
  setTimeout(() => toast.remove(), TOAST_MS);
}

async function main(): Promise<void> {
  const root = byId<HTMLDivElement>('app');
  const toasts = h('div', { class: 'toasts' });
  document.body.append(toasts);

  const db = await openDb();
  void requestPersistentStorage();
  // Changes stashed while the page was closing are newer than the saved project.
  const stashed = takeStashed();
  if (stashed) await saveProject(db, stashed);
  const project = stashed ?? (await loadProject(db)) ?? createProject();

  const monitorVideo = h('video', { muted: true, playsInline: true });
  const monitorEmpty = h('div', { class: 'monitor-empty' }, 'No video');
  const app = new App(db, project, monitorVideo);
  app.onError((message) => showToast(toasts, message));

  const header = createHeader(app);
  const track = createTrack(app);
  const cueList = createCueList(app);
  const help = createHelp();
  // Settings is made below; the MTC badge only opens it once the app is running.
  const pageList = createPageList(app, help.open, () => settings.openTimecode());
  const files = createFileMenu(app, db);
  const footer = createFooter(app, files);
  const settings = createSettings(app, files);
  const mediaBar = createMediaBar(app, settings.open, track);
  const mixer = createMixer(app);
  const memoView = createMemoView(app);
  const monitor = createMonitor(monitorVideo, monitorEmpty, mixer.element, memoView.element, () => splitters.apply());

  const main = h('main', { class: 'main' });
  const splitters = createSplitters(main, monitor.minWidth);
  main.append(
    h('section', { class: 'track-area' }, mediaBar.element, track.element),
    splitters.trackSplitter,
    pageList.element,
    splitters.pagesSplitter,
    cueList.element,
    splitters.monitorSplitter,
    monitor.element,
  );
  root.replaceChildren(
    header.element,
    main,
    footer.element,
    settings.element,
    help.element,
    files.confirmDialog,
    createOtherTabsWarning().element,
  );
  splitters.apply();

  const update = () => {
    header.update();
    mediaBar.update();
    track.update();
    cueList.update();
    pageList.update();
    footer.update();
    mixer.update();
    memoView.update();
    monitorEmpty.hidden = app.page.videoMediaId !== null;
  };
  app.onChange(update);
  // A control run from the MIDI remote lights its button for a moment.
  const remoteButtons: Record<RemoteAction, string> = {
    go: '.header .go',
    playStop: '.footer .play',
    fadeOut: '.footer .fade',
    previousCue: '.footer button[title^="Previous marker"]',
    nextCue: '.footer button[title^="Next marker"]',
  };
  app.onRemote((action) => {
    const button = document.querySelector(remoteButtons[action]);
    button?.classList.add('remote-hit');
    setTimeout(() => button?.classList.remove('remote-hit'), 250);
  });
  app.mtc.onChange(update);
  files.onChange(update);
  setEditGuard(() => !app.editLocked());
  keepEscapeInFullscreen();
  installKeyboard(app, track, files, settings.open, help.open);
  update();

  const frame = () => {
    const time = app.transport.tick();
    header.tick(time);
    track.draw(time);
    cueList.tick(time);
    if (monitor.view() === 'mixer') mixer.tick();
    const memo = app.memoAt(time);
    const { settings } = app.project;
    if (monitor.view() === 'memo') memoView.render(memo);
    monitor.renderVideoMemo(memo, settings);
    app.output.renderMemo(settings.memoOutput ? memo : null, settings);
    // The prompter always shows the memos; Output only decides the video output.
    app.prompter.renderMemo(memo, settings);
    monitor.setAspect(app.output.aspect ?? 16 / 9);
    app.output.check();
    app.prompter.check();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  enableOffline(footer.showOfflineReady);
  await files.load();
  await app.start();
  update();
}

const MONITOR_VIEW_KEY = 'cue-player-monitor-view';

/** The video monitor, or the mixer or the memo in its place; the choice is remembered in this browser. */
function createMonitor(
  video: HTMLVideoElement,
  empty: HTMLElement,
  mixer: HTMLElement,
  memo: HTMLElement,
  onSwitch: () => void,
) {
  let view = 'video';
  try {
    view = localStorage.getItem(MONITOR_VIEW_KEY) ?? 'video';
  } catch {
    // Starting on the video is fine.
  }
  const tab = (name: string, label: string) =>
    h('button', { type: 'button', class: 'small', 'data-view': name, onclick: () => show(name, true) }, label);
  const tabs = h('div', { class: 'monitor-tabs' }, tab('video', 'Video'), tab('memo', 'Memo'), tab('mixer', 'Mixer'));
  // The video element keeps playing under the others: it is also the Video track's sound.
  // The Video view shows what the video output shows: the memos too while "Memo on video output" is on.
  const videoMemo = createMemoStage();
  const screen = h('div', { class: 'screen' }, video, empty, videoMemo.element);
  const element = h('section', { class: 'monitor' }, screen, mixer, memo, tabs);

  function show(name: string, switched = false): void {
    view = name;
    try {
      localStorage.setItem(MONITOR_VIEW_KEY, name);
    } catch {
      // Not remembering the view is fine.
    }
    mixer.hidden = name !== 'mixer';
    memo.hidden = name !== 'memo';
    for (const b of tabs.querySelectorAll<HTMLElement>('button')) b.classList.toggle('active', b.dataset.view === name);
    // The mixer may need a wider monitor.
    if (switched) onSwitch();
  }
  show(view);

  /**
   * The narrowest the monitor may get: the mixer's strips side by side (also for
   * the memo), or for the video just the view buttons with 8px margins.
   */
  function minWidth(): number {
    if (view === 'video') return tabs.offsetWidth + 16;
    // Under the memo the mixer is hidden; lay it out unseen just to measure it.
    const measuring = mixer.hidden;
    if (measuring) {
      mixer.style.visibility = 'hidden';
      mixer.hidden = false;
    }
    const width = mixerWidth();
    if (measuring) {
      mixer.hidden = true;
      mixer.style.visibility = '';
    }
    return width;
  }

  function mixerWidth(): number {
    const style = getComputedStyle(mixer);
    const children = [...mixer.children] as HTMLElement[];
    const content = children.reduce((sum, child) => sum + child.offsetWidth, 0);
    const gaps = parseFloat(style.columnGap) * Math.max(0, children.length - 1);
    return Math.ceil(content + gaps + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight));
  }

  let aspect = 0;
  /** The video output's width / height, so the monitor frames the picture the same way. */
  function setAspect(value: number): void {
    if (Math.abs(value - aspect) < 1e-3) return;
    aspect = value;
    element.style.setProperty('--screen-aspect', String(value));
  }

  /** Call every frame: the Video view mirrors the video output, memos included or not. */
  function renderVideoMemo(memo: string, settings: Settings): void {
    videoMemo.element.hidden = !settings.memoOutput;
    if (view === 'video' && settings.memoOutput) videoMemo.render(memo, settings);
  }

  return { element, minWidth, setAspect, view: () => view, renderVideoMemo };
}

main().catch((error) => {
  console.error(error);
  document.body.textContent = `Failed to start: ${(error as Error).message}`;
});
