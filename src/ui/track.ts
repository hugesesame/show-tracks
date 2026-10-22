import type { App } from '../app/app';
import { PEAK_PAIRS_PER_SECOND } from '../media/peaks';
import type { MediaRecord } from '../model/types';
import { h } from './dom';

const MARKER_HIT_PX = 6;
const LABEL_HEIGHT = 18;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** The waveform, markers and playhead. Click to seek, drag a marker to move it. */
export function createTrack(app: App) {
  const canvas = h('canvas');
  const empty = h('div', { class: 'track-empty' });
  const element = h('div', { class: 'track' }, canvas, empty);
  const ctx = canvas.getContext('2d')!;

  let width = 0;
  let height = 0;
  let dpr = 1;
  /** Per-pixel min/max of the waveform, rebuilt when the size or media changes. */
  let columns: Float32Array | null = null;
  let columnsKey = '';
  let colors: Record<string, string> = {};

  const timeToX = (t: number) => (app.duration > 0 ? (t / app.duration) * width : 0);
  const xToTime = (x: number) => (width > 0 ? Math.min(Math.max(x / width, 0), 1) * app.duration : 0);

  function waveformMedia(): MediaRecord | null {
    const page = app.page;
    const audio = app.mediaFor(page.audioMediaId);
    return audio ?? app.mediaFor(page.videoMediaId);
  }

  function resize(): void {
    dpr = window.devicePixelRatio || 1;
    width = element.clientWidth;
    height = element.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    columnsKey = '';
    colors = {
      bg: cssVar('--panel'),
      wave: cssVar('--wave'),
      line: cssVar('--line'),
      marker: cssVar('--marker'),
      accent: cssVar('--accent'),
      playhead: cssVar('--playhead'),
      text: cssVar('--text'),
    };
  }

  function buildColumns(): void {
    const media = waveformMedia();
    const key = `${media?.id}:${width}:${app.duration}`;
    if (key === columnsKey) return;
    columnsKey = key;
    columns = null;
    const peaks = media?.peaks;
    if (!peaks || app.duration <= 0 || width <= 0) return;
    const pairs = peaks.length / 2;
    const out = new Float32Array(width * 2);
    for (let x = 0; x < width; x++) {
      const from = Math.floor((xToTime(x) * PEAK_PAIRS_PER_SECOND));
      const to = Math.max(from + 1, Math.floor(xToTime(x + 1) * PEAK_PAIRS_PER_SECOND));
      let min = 0;
      let max = 0;
      for (let i = from; i < Math.min(to, pairs); i++) {
        if (peaks[i * 2] < min) min = peaks[i * 2];
        if (peaks[i * 2 + 1] > max) max = peaks[i * 2 + 1];
      }
      out[x * 2] = min;
      out[x * 2 + 1] = max;
    }
    columns = out;
  }

  function draw(time: number): void {
    if (element.clientWidth !== width || element.clientHeight !== height) resize();
    buildColumns();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    const waveTop = LABEL_HEIGHT;
    const mid = waveTop + (height - waveTop) / 2;
    const amp = (height - waveTop) / 2 - 4;
    ctx.strokeStyle = colors.line;
    ctx.beginPath();
    ctx.moveTo(0, mid + 0.5);
    ctx.lineTo(width, mid + 0.5);
    ctx.stroke();

    if (columns) {
      ctx.fillStyle = colors.wave;
      for (let x = 0; x < width; x++) {
        const top = mid - columns[x * 2 + 1] * amp;
        const bottom = mid - columns[x * 2] * amp;
        ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
      }
    }

    const { standby } = app.cue;
    ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
    ctx.textBaseline = 'middle';
    for (const marker of app.page.markers) {
      const x = Math.round(timeToX(marker.time)) + 0.5;
      const isStandby = standby.kind === 'cue' && standby.markerId === marker.id;
      const color = isStandby ? colors.accent : colors.marker;
      ctx.strokeStyle = color;
      ctx.lineWidth = isStandby ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      const label = marker.name;
      const labelWidth = ctx.measureText(label).width + 8;
      ctx.fillStyle = color;
      ctx.fillRect(x, 2, labelWidth, LABEL_HEIGHT - 4);
      ctx.fillStyle = '#111';
      ctx.fillText(label, x + 4, LABEL_HEIGHT / 2);
    }
    ctx.lineWidth = 1;

    if (app.duration > 0) {
      const x = Math.round(timeToX(time)) + 0.5;
      ctx.strokeStyle = colors.playhead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  function markerAt(x: number): string | null {
    let best: string | null = null;
    let bestDistance = MARKER_HIT_PX;
    for (const marker of app.page.markers) {
      const distance = Math.abs(timeToX(marker.time) - x);
      if (distance <= bestDistance) {
        best = marker.id;
        bestDistance = distance;
      }
    }
    return best;
  }

  element.addEventListener('pointerdown', (e) => {
    if (app.duration <= 0 || e.button !== 0) return;
    const rect = element.getBoundingClientRect();
    const xOf = (ev: PointerEvent) => ev.clientX - rect.left;
    const markerId = markerAt(xOf(e));
    element.setPointerCapture(e.pointerId);
    if (markerId) app.selectCue(markerId);
    else app.seek(xToTime(xOf(e)));

    const move = (ev: PointerEvent) => {
      if (markerId) app.setMarkerTime(markerId, xToTime(xOf(ev)));
      else app.seek(xToTime(xOf(ev)));
    };
    const up = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
  });

  element.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    const x = e.clientX - element.getBoundingClientRect().left;
    element.style.cursor = markerAt(x) ? 'ew-resize' : '';
  });

  function update(): void {
    const page = app.page;
    const missing = app.missingMediaPageIds().includes(page.id);
    empty.textContent = missing
      ? 'Media missing: choose the file again with the buttons above.'
      : !page.audioMediaId && !page.videoMediaId
        ? 'Choose an audio or video file.'
        : '';
  }

  return { element, draw, update };
}
