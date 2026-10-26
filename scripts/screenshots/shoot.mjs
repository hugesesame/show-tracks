// Takes the README screenshots (screenshots/main.png, memo.png, mixer.png) from
// the sample show in show.json and the media from make-media.mjs, in Chrome.
// Run the dev server first; pass another URL to shoot elsewhere.
//   node scripts/screenshots/make-media.mjs
//   node scripts/screenshots/shoot.mjs [http://localhost:5173/]
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const media = join(here, 'media');
const out = join(here, '..', '..', 'screenshots');
const url = process.argv[2] ?? 'http://localhost:5173/';

/** Playwright from the project if it is installed there, else the global one. */
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(join(root, 'noop.js'))('playwright');
  }
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const show = readFileSync(join(here, 'show.json'), 'utf8');
await context.addInitScript((show) => {
  // A MIDI output, so the header shows MTC OUT as it does with real gear.
  const output = { id: 'screenshot-midi', name: 'IAC Driver Bus 1', state: 'connected', send() {} };
  navigator.requestMIDIAccess = async () => ({ inputs: new Map(), outputs: new Map([[output.id, output]]), onstatechange: null });
  // The show is handed over as changes stashed on the last unload, which the app picks up on start.
  if (!sessionStorage.getItem('screenshot-seeded')) {
    localStorage.setItem('cue-player-unsaved', show);
    sessionStorage.setItem('screenshot-seeded', '1');
  }
}, show);

const page = await context.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(url);
await page.waitForTimeout(1000);

// Media for each page, through the Choose buttons.
const choose = async (kind, file) => {
  await page.locator(`input[type=file][accept="${kind}/*"]`).setInputFiles(join(media, file));
  await page.waitForTimeout(1500);
};
const openPage = async (name) => {
  await page.locator('.page-row', { hasText: name }).click();
  await page.waitForTimeout(600);
};
await openPage('Opening');
await choose('audio', 'opening.wav');
await openPage('Night Drive');
await choose('audio', 'night-drive.wav');
await openPage('Morning Light');
await choose('audio', 'song.wav');
await choose('video', 'video.mp4');

// Both lists still, from the top, so every page and cue shows.
for (const auto of await page.locator('.panel-actions button', { hasText: 'Auto' }).all()) await auto.click();
await page.evaluate(() => document.querySelectorAll('.page-list, .cue-list').forEach((l) => l.scrollTo(0, 0)));

// Verse 2 on standby, the playhead at 0:45 just past it.
await page.locator('.cue-row', { hasText: 'Verse 2' }).click();
await page.mouse.click(800, 700);
await page.keyboard.press('Home');
for (let i = 0; i < 9; i++) await page.keyboard.press('Alt+ArrowRight');
await page.waitForTimeout(500);

const tab = (name) => page.getByRole('button', { name, exact: true }).first().click();
const shoot = async (file) => {
  await page.mouse.move(1, 1);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, file) });
  console.log(`screenshots/${file}`);
};

await tab('Title');
await tab('Video');
await shoot('main.png');

await tab('Memo');
await page.locator('.monitor-tabs button', { hasText: 'Memo' }).click();
await shoot('memo.png');

await tab('Title');
await tab('Mixer');
await page.keyboard.press('Space');
await page.waitForTimeout(1200);
await shoot('mixer.png');
await page.keyboard.press('Space');

await browser.close();
