import './style.css';
import { App } from './app/app';
import { createProject } from './model/project';
import { loadProject, openDb, requestPersistentStorage } from './storage/db';
import { createCueList } from './ui/cueList';
import { byId, h } from './ui/dom';
import { createFooter } from './ui/footer';
import { createHeader } from './ui/header';
import { installKeyboard } from './ui/keyboard';
import { createMediaBar } from './ui/mediaBar';
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
  const project = (await loadProject(db)) ?? createProject();

  const monitorVideo = h('video', { muted: true, playsInline: true });
  const monitorEmpty = h('div', { class: 'monitor-empty' }, 'No video');
  const app = new App(db, project, monitorVideo);
  app.onError((message) => showToast(toasts, message));

  const header = createHeader(app);
  const track = createTrack(app);
  const cueList = createCueList(app);
  const footer = createFooter(app);
  const settings = createSettings(app);
  const mediaBar = createMediaBar(app, settings.open, track);

  root.replaceChildren(
    header.element,
    h(
      'main',
      { class: 'main' },
      h('section', { class: 'track-area' }, mediaBar.element, track.element),
      cueList.element,
      h('section', { class: 'monitor' }, monitorVideo, monitorEmpty),
    ),
    footer.element,
    settings.element,
  );

  const update = () => {
    header.update();
    mediaBar.update();
    track.update();
    cueList.update();
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
