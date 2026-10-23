import './style.css';
import { App } from './app/app';
import { createProject } from './model/project';
import { loadProject, openDb, requestPersistentStorage, saveProject, takeStashed } from './storage/db';
import { createCueList } from './ui/cueList';
import { byId, h } from './ui/dom';
import { createFileMenu } from './ui/fileMenu';
import { createFooter } from './ui/footer';
import { createHeader } from './ui/header';
import { installKeyboard } from './ui/keyboard';
import { createSplitters } from './ui/layout';
import { createMediaBar } from './ui/mediaBar';
import { createMixer } from './ui/mixer';
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
  const pageList = createPageList(app);
  const files = createFileMenu(app, db);
  const footer = createFooter(app, files);
  const settings = createSettings(app, files);
  const mediaBar = createMediaBar(app, settings.open, track);
  const mixer = createMixer(app);
  const monitor = createMonitor(monitorVideo, monitorEmpty, mixer.element, () => splitters.apply());

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
  root.replaceChildren(header.element, main, footer.element, settings.element, files.confirmDialog);
  splitters.apply();

  const update = () => {
    header.update();
    mediaBar.update();
    track.update();
    cueList.update();
    pageList.update();
    footer.update();
    mixer.update();
    monitorEmpty.hidden = app.page.videoMediaId !== null;
  };
  app.onChange(update);
  app.mtc.onChange(update);
  files.onChange(update);
  installKeyboard(app, track, files, settings.open);
  update();

  const frame = () => {
    const time = app.transport.tick();
    header.tick(time);
    track.draw(time);
    if (monitor.showsMixer()) mixer.tick();
    app.output.check();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  await files.load();
  await app.start();
  update();
}

const MONITOR_VIEW_KEY = 'cue-player-monitor-view';

/** The video monitor, or the mixer in its place; the choice is remembered in this browser. */
function createMonitor(video: HTMLVideoElement, empty: HTMLElement, mixer: HTMLElement, onSwitch: () => void) {
  let view = 'video';
  try {
    view = localStorage.getItem(MONITOR_VIEW_KEY) ?? 'video';
  } catch {
    // Starting on the video is fine.
  }
  const tab = (name: string, label: string) =>
    h('button', { type: 'button', class: 'small', 'data-view': name, onclick: () => show(name, true) }, label);
  const tabs = h('div', { class: 'monitor-tabs' }, tab('video', 'Video'), tab('mixer', 'Mixer'));
  // The video element keeps playing under the mixer: it is also the Video track's sound.
  const element = h('section', { class: 'monitor' }, video, empty, mixer, tabs);

  function show(name: string, switched = false): void {
    view = name;
    try {
      localStorage.setItem(MONITOR_VIEW_KEY, name);
    } catch {
      // Not remembering the view is fine.
    }
    mixer.hidden = name !== 'mixer';
    for (const b of tabs.querySelectorAll<HTMLElement>('button')) b.classList.toggle('active', b.dataset.view === name);
    // The mixer may need a wider monitor.
    if (switched) onSwitch();
  }
  show(view);

  /** The narrowest the monitor may get: the mixer's strips side by side, or 0 for the video. */
  function minWidth(): number {
    if (view !== 'mixer') return 0;
    const style = getComputedStyle(mixer);
    const children = [...mixer.children] as HTMLElement[];
    const content = children.reduce((sum, child) => sum + child.offsetWidth, 0);
    const gaps = parseFloat(style.columnGap) * Math.max(0, children.length - 1);
    return Math.ceil(content + gaps + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight));
  }

  return { element, minWidth, showsMixer: () => view === 'mixer' };
}

main().catch((error) => {
  console.error(error);
  document.body.textContent = `Failed to start: ${(error as Error).message}`;
});
