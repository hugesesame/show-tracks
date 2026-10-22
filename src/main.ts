import './style.css';
import { App } from './app/app';
import { createProject } from './model/project';
import { loadProject, openDb, requestPersistentStorage, saveProject, takeStashed } from './storage/db';
import { createCueList } from './ui/cueList';
import { byId, h } from './ui/dom';
import { createFooter } from './ui/footer';
import { createHeader } from './ui/header';
import { installKeyboard } from './ui/keyboard';
import { createSplitters } from './ui/layout';
import { createMediaBar } from './ui/mediaBar';
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
  const footer = createFooter(app);
  const settings = createSettings(app);
  const mediaBar = createMediaBar(app, settings.open, track);

  const main = h('main', { class: 'main' });
  const splitters = createSplitters(main);
  main.append(
    h('section', { class: 'track-area' }, mediaBar.element, track.element),
    splitters.trackSplitter,
    pageList.element,
    splitters.pagesSplitter,
    cueList.element,
    splitters.monitorSplitter,
    h('section', { class: 'monitor' }, monitorVideo, monitorEmpty),
  );
  root.replaceChildren(header.element, main, footer.element, settings.element);
  splitters.apply();

  const update = () => {
    header.update();
    mediaBar.update();
    track.update();
    cueList.update();
    pageList.update();
    footer.update();
    monitorEmpty.hidden = app.page.videoMediaId !== null;
  };
  app.onChange(update);
  app.mtc.onChange(update);
  installKeyboard(app, track);
  update();

  const frame = () => {
    const time = app.transport.tick();
    header.tick(time);
    track.draw(time);
    app.output.check();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  await app.start();
  update();
}

main().catch((error) => {
  console.error(error);
  document.body.textContent = `Failed to start: ${(error as Error).message}`;
});
