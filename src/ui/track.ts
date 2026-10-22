import type { App } from '../app/app';
import { PEAK_PAIRS_PER_SECOND } from '../media/peaks';
import type { MediaRecord } from '../model/types';
import { h } from './dom';
import { DEFAULT_VOLUME } from '../model/project';
import { formatClock } from './format';

const MARKER_HIT_PX = 5;
const CLICK_SLOP_PX = 3;
const LABEL_HEIGHT = 18;
const LANE_GAP = 4;
const CLIP_HEADER = 16;
/** Room after the last clip so it can be dragged later. */
const VIEW_HEADROOM = 1.15;
const MIN_VIEW_SECONDS = 10;
const ZOOM_STEP = 1.5;
const MAX_ZOOM = 200;
/** While playing, the view scrolls when the playhead gets this close to the right edge. */
const FOLLOW_EDGE = 0.95;

type Kind = MediaRecord['kind'];
type Rect = { x: number; y: number; w: number; h: number };

const VOLUME_TICKS = [0, 0.25, 0.5, 0.75, 1];
/** Must match the thumb width in style.css, to find the thumb under the pointer. */
const VOLUME_THUMB_PX = 12;

/** How fast the meters fall back, in meter widths per second. */
const METER_FALL_PER_SECOND = 1.5;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Audio and video clips on two lanes, with markers and the playhead across both. */
export function createTrack(app: App) {
  const canvas = h('canvas');
  const empty = h('div', { class: 'track-empty' });
  const element = h('div', { class: 'track' }, canvas, empty);
  const ctx = canvas.getContext('2d')!;
  const headers = { audio: laneHeader(app, 'audio'), video: laneHeader(app, 'video') };
  const wrap = h(
    'div',
    { class: 'track-wrap' },
    h('div', { class: 'track-headers' }, headers.audio.element, headers.video.element),
    element,
  );

  let width = 0;
  let height = 0;
  let dpr = 1;
  let colors: Record<string, string> = {};
  /** Frozen while a clip is dragged, so the scale does not shift under the pointer. */
  let frozenView: number | null = null;
  /** Per-pixel min/max of the audio waveform, rebuilt when the layout changes. */
  let columns: Float32Array | null = null;
  let columnsStart = 0;
  let columnsKey = '';
  /** 1 shows the whole page; larger values show a shorter span starting at viewStart. */
  let zoom = 1;
  let viewStart = 0;
  let lastTime = 0;

  /** Seconds covered at zoom 1. */
  const viewDuration = () =>
    frozenView ?? (app.duration > 0 ? Math.max(app.duration * VIEW_HEADROOM, MIN_VIEW_SECONDS) : 0);
  const span = () => viewDuration() / zoom;
  const timeToX = (t: number) => (span() > 0 ? ((t - viewStart) / span()) * width : 0);
  const xToTime = (x: number) => (width > 0 ? viewStart + (x / width) * span() : 0);
  const dxToTime = (dx: number) => (width > 0 ? (dx / width) * span() : 0);

  function clampView(): void {
    viewStart = Math.min(Math.max(viewStart, 0), Math.max(0, viewDuration() - span()));
  }

  /** Zooms keeping `anchor` (default: the playhead, or the centre if it is off screen) in place. */
  function zoomBy(factor: number, anchor?: number): void {
    if (viewDuration() <= 0) return;
    let time = anchor ?? app.transport.now();
    let x = timeToX(time);
    if (anchor === undefined && (x < 0 || x > width)) {
      x = width / 2;
      time = xToTime(x);
    }
    zoom = Math.min(Math.max(zoom * factor, 1), MAX_ZOOM);
    viewStart = time - (x / width) * span();
    clampView();
  }

  function zoomFit(): void {
    zoom = 1;
    viewStart = 0;
  }

  function lane(kind: Kind): Rect {
    const laneHeight = (height - LABEL_HEIGHT - LANE_GAP * 3) / 2;
    const y = LABEL_HEIGHT + LANE_GAP + (kind === 'audio' ? 0 : laneHeight + LANE_GAP);
    return { x: 0, y, w: width, h: laneHeight };
  }

  function clip(kind: Kind): { rect: Rect; media: MediaRecord; offset: number } | null {
    const page = app.page;
    const media = app.mediaFor(kind === 'audio' ? page.audioMediaId : page.videoMediaId);
    const duration = kind === 'audio' ? app.transport.audioDuration : app.transport.videoDuration;
    if (!media || !duration) return null;
    const offset = kind === 'audio' ? page.audioOffset : page.videoOffset;
    const { y, h: laneHeight } = lane(kind);
    const x = timeToX(offset);
    return { rect: { x, y, w: Math.max(2, timeToX(offset + duration) - x), h: laneHeight }, media, offset };
  }

  function resize(): void {
    dpr = window.devicePixelRatio || 1;
    width = element.clientWidth;
    height = element.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    for (const kind of ['audio', 'video'] as const) {
      const { y, h: laneHeight } = lane(kind);
      headers[kind].element.style.top = `${y}px`;
      headers[kind].element.style.height = `${laneHeight}px`;
    }
    colors = Object.fromEntries(
      ['--panel', '--panel-2', '--wave', '--line', '--marker', '--selected', '--playhead', '--text', '--muted',
        '--clip-audio', '--clip-audio-edge', '--clip-video', '--clip-video-edge'].map((n) => [n, cssVar(n)]),
    );
  }

  function buildColumns(rect: Rect, media: MediaRecord, offset: number): void {
    const key = `${media.id}:${width}:${span()}:${viewStart}:${offset}`;
    if (key === columnsKey) return;
    columnsKey = key;
    columns = null;
    const peaks = media.peaks;
    if (!peaks) return;
    const pairs = peaks.length / 2;
    // Only the visible part: a zoomed-in long clip can be far wider than the screen.
    columnsStart = Math.max(0, Math.floor(rect.x));
    const end = Math.min(width, Math.ceil(rect.x + rect.w));
    const out = new Float32Array(Math.max(0, end - columnsStart) * 2);
    for (let i = 0; i < out.length / 2; i++) {
      const x = columnsStart + i;
      const from = Math.floor((xToTime(x) - offset) * PEAK_PAIRS_PER_SECOND);
      const to = Math.max(from + 1, Math.floor((xToTime(x + 1) - offset) * PEAK_PAIRS_PER_SECOND));
      let min = 0;
      let max = 0;
      for (let p = Math.max(0, from); p < Math.min(to, pairs); p++) {
        if (peaks[p * 2] < min) min = peaks[p * 2];
        if (peaks[p * 2 + 1] > max) max = peaks[p * 2 + 1];
      }
      out[i * 2] = min;
      out[i * 2 + 1] = max;
    }
    columns = out;
  }

  function drawClip(kind: Kind): void {
    const c = clip(kind);
    if (!c) return;
    const { rect, media, offset } = c;
    const fill = colors[kind === 'audio' ? '--clip-audio' : '--clip-video'];
    const edge = colors[kind === 'audio' ? '--clip-audio-edge' : '--clip-video-edge'];
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 4);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.fillStyle = colors['--text'];
    ctx.fillText(`${media.fileName}  ·  ${formatClock(offset)}`, rect.x + 6, rect.y + CLIP_HEADER / 2 + 1);

    if (kind === 'audio') {
      buildColumns(rect, media, offset);
      if (columns) {
        const top = rect.y + CLIP_HEADER;
        const mid = top + (rect.h - CLIP_HEADER) / 2;
        const amp = (rect.h - CLIP_HEADER) / 2 - 3;
        ctx.fillStyle = colors['--wave'];
        for (let i = 0; i < columns.length / 2; i++) {
          const y1 = mid - columns[i * 2 + 1] * amp;
          const y2 = mid - columns[i * 2] * amp;
          ctx.fillRect(columnsStart + i, y1, 1, Math.max(1, y2 - y1));
        }
      }
    }
    ctx.restore();
  }

  function draw(time: number): void {
    if (element.clientWidth !== width || element.clientHeight !== height) resize();
    clampView();
    headers.audio.tick();
    headers.video.tick();
    // Keep a moving playhead in view (playback, marker jumps), but leave the
    // view alone when only the user scrolled.
    if (zoom > 1 && frozenView === null && time !== lastTime) {
      const x = timeToX(time);
      if (x > width * FOLLOW_EDGE || x < 0) {
        viewStart = app.transport.playing ? time - span() * (1 - FOLLOW_EDGE) : time - span() / 2;
        clampView();
      }
    }
    lastTime = time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors['--panel'];
    ctx.fillRect(0, 0, width, height);
    ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
    ctx.textBaseline = 'middle';

    for (const kind of ['audio', 'video'] as const) {
      const { y, h: laneHeight } = lane(kind);
      ctx.fillStyle = colors['--panel-2'];
      ctx.fillRect(0, y, width, laneHeight);
      drawClip(kind);
    }
    if (app.duration > 0) {
      // Dim the timeline past the end of the page.
      const end = timeToX(app.duration);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(end, LABEL_HEIGHT, width - end, height - LABEL_HEIGHT);
    }

    const { standby } = app.cue;
    for (const marker of app.page.markers) {
      const x = Math.round(timeToX(marker.time)) + 0.5;
      const isStandby = standby.kind === 'cue' && standby.markerId === marker.id;
      const color = isStandby ? colors['--selected'] : colors['--marker'];
      ctx.strokeStyle = color;
      ctx.lineWidth = isStandby ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      const labelWidth = ctx.measureText(marker.name).width + 8;
      ctx.fillStyle = color;
      ctx.fillRect(x, 2, labelWidth, LABEL_HEIGHT - 4);
      // Dark text on the green selection, light text on the blue markers.
      ctx.fillStyle = isStandby ? '#111' : '#fff';
      ctx.fillText(marker.name, x + 4, LABEL_HEIGHT / 2);
    }
    ctx.lineWidth = 1;

    if (app.duration > 0) {
      const x = Math.round(timeToX(time)) + 0.5;
      ctx.strokeStyle = colors['--playhead'];
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

  function clipAt(x: number, y: number): Kind | null {
    for (const kind of ['audio', 'video'] as const) {
      const r = clip(kind)?.rect;
      if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return kind;
    }
    return null;
  }

  function hit(x: number, y: number): { marker: string } | { clip: Kind } | null {
    const marker = markerAt(x);
    if (marker) return { marker };
    const kind = clipAt(x, y);
    return kind ? { clip: kind } : null;
  }

  element.addEventListener('pointerdown', (e) => {
    if (app.duration <= 0 || e.button !== 0) return;
    const rect = element.getBoundingClientRect();
    const xOf = (ev: PointerEvent) => ev.clientX - rect.left;
    const startX = xOf(e);
    const target = hit(startX, e.clientY - rect.top);
    element.setPointerCapture(e.pointerId);

    let move: (ev: PointerEvent) => void;
    let onClick: (() => void) | null = null;
    let dragged = false;
    if (target && 'marker' in target) {
      app.selectCue(target.marker);
      move = (ev) => app.setMarkerTime(target.marker, Math.min(xToTime(xOf(ev)), app.duration));
    } else if (target && 'clip' in target) {
      frozenView = viewDuration();
      const page = app.page;
      const startOffset = target.clip === 'audio' ? page.audioOffset : page.videoOffset;
      element.style.cursor = 'grabbing';
      move = (ev) => {
        if (!dragged && Math.abs(xOf(ev) - startX) < CLICK_SLOP_PX) return;
        dragged = true;
        app.moveClip(target.clip, startOffset + dxToTime(xOf(ev) - startX));
      };
      // A click on a clip without dragging seeks, like on an empty lane.
      onClick = () => app.seek(xToTime(startX));
    } else {
      app.seek(xToTime(startX));
      move = (ev) => app.seek(xToTime(xOf(ev)));
    }

    const up = () => {
      if (!dragged) onClick?.();
      frozenView = null;
      element.style.cursor = '';
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
    const rect = element.getBoundingClientRect();
    const target = hit(e.clientX - rect.left, e.clientY - rect.top);
    element.style.cursor = !target ? '' : 'marker' in target ? 'ew-resize' : 'grab';
  });

  // Trackpad: pinch (reported as ctrl+wheel) zooms at the pointer, horizontal swipe scrolls.
  element.addEventListener(
    'wheel',
    (e) => {
      if (viewDuration() <= 0) return;
      const x = e.clientX - element.getBoundingClientRect().left;
      if (e.ctrlKey) {
        e.preventDefault();
        zoomBy(Math.exp(-e.deltaY * 0.01), xToTime(x));
        return;
      }
      const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
      if (!dx || zoom === 1) return;
      e.preventDefault();
      viewStart += dxToTime(dx);
      clampView();
    },
    { passive: false },
  );

  function update(): void {
    headers.audio.update();
    headers.video.update();
    const page = app.page;
    const missing = app.missingMediaPageIds().includes(page.id);
    empty.textContent = missing
      ? 'Media missing: choose the file again with the buttons above.'
      : !page.audioMediaId && !page.videoMediaId
        ? 'Choose an audio or video file.'
        : '';
  }

  return {
    element: wrap,
    draw,
    update,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    zoomFit,
  };
}

/** Name, mute, volume and a stereo meter at the left of a lane. */
function laneHeader(app: App, kind: Kind) {
  const level = () => {
    const page = app.page;
    return kind === 'audio'
      ? { volume: page.audioVolume, muted: page.audioMuted }
      : { volume: page.videoAudioVolume, muted: !page.videoAudioEnabled };
  };
  const mute = h('button', {
    class: 'mute',
    title: 'Mute',
    onclick: () => app.setTrackLevel(kind, level().volume, !level().muted),
  }, 'M');
  const volume = h('input', {
    class: 'volume',
    type: 'range',
    min: 0,
    max: 1,
    step: 0.01,
    oninput: () => app.setTrackLevel(kind, Number(volume.value), level().muted),
  });
  resetOnThumbClick(volume, () => app.setTrackLevel(kind, DEFAULT_VOLUME, level().muted));
  const volumeWrap = h(
    'div',
    { class: 'volume-wrap' },
    ...VOLUME_TICKS.map((t) => h('span', { class: 'tick', style: `--at: ${t}` })),
    volume,
  );
  const masks = [h('div', { class: 'meter-mask' }), h('div', { class: 'meter-mask' })];
  const element = h(
    'div',
    { class: 'lane-header' },
    h('div', { class: 'lane-top' }, h('span', { class: 'lane-name' }, kind === 'audio' ? 'Audio' : 'Video'), mute),
    volumeWrap,
    h('div', { class: 'meter' }, ...masks.map((mask) => h('div', { class: 'meter-bar' }, mask))),
  );

  const shown = [0, 0];
  let lastTick = performance.now();

  function update(): void {
    const { volume: v, muted } = level();
    const hasMedia = (kind === 'audio' ? app.page.audioMediaId : app.page.videoMediaId) !== null;
    volume.value = String(v);
    volume.style.setProperty('--fill', String(v));
    volume.title = `Volume ${Math.round(v * 100)}%`;
    volume.disabled = mute.disabled = !hasMedia;
    mute.classList.toggle('on', muted);
    mute.title = muted ? 'Unmute' : 'Mute';
  }

  /** Peaks jump up at once and fall back smoothly. */
  function tick(): void {
    const now = performance.now();
    const fall = ((now - lastTick) / 1000) * METER_FALL_PER_SECOND;
    lastTick = now;
    app.transport.mixer.levels(kind).forEach((peak, i) => {
      shown[i] = Math.max(peak, shown[i] - fall);
      masks[i].style.width = `${(1 - shown[i]) * 100}%`;
    });
  }

  return { element, update, tick };
}

/** A click on the thumb that does not drag it resets the slider. */
function resetOnThumbClick(slider: HTMLInputElement, reset: () => void): void {
  let pressedOnThumb = false;
  let startValue = '';
  slider.addEventListener('pointerdown', (e) => {
    const rect = slider.getBoundingClientRect();
    const value = (Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
    const thumbX = rect.left + VOLUME_THUMB_PX / 2 + value * (rect.width - VOLUME_THUMB_PX);
    pressedOnThumb = Math.abs(e.clientX - thumbX) <= VOLUME_THUMB_PX / 2 + 2;
    startValue = slider.value;
  });
  slider.addEventListener('pointerup', () => {
    if (pressedOnThumb && slider.value === startValue) reset();
    pressedOnThumb = false;
  });
}
