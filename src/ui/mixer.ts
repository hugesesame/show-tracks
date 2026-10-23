import type { App } from '../app/app';
import type { StripKind } from '../engine/mixer';
import { DEFAULT_VOLUME, MASTER_VOLUME } from '../model/project';
import { h } from './dom';

/** Must match the fader thumb height in style.css. */
const THUMB_PX = 22;
const FADER_TICKS = [0, 0.25, 0.5, 0.75, 1];
/** How fast the meters fall back, in meter heights per second. */
const METER_FALL_PER_SECOND = 1.5;

type Level = { volume: number; muted: boolean; pan: number; enabled: boolean };

const STRIPS: { kind: StripKind; name: string; reset: number }[] = [
  { kind: 'audio', name: 'Audio', reset: DEFAULT_VOLUME },
  { kind: 'video', name: 'Video', reset: DEFAULT_VOLUME },
  { kind: 'master', name: 'Master', reset: MASTER_VOLUME },
];

const panLabel = (pan: number) => {
  const amount = Math.round(Math.abs(pan) * 100);
  return amount === 0 ? 'C' : `${pan < 0 ? 'L' : 'R'}${amount}`;
};

/** Vertical faders with meters, mute and pan for both tracks and the Master. */
export function createMixer(app: App) {
  const level = (kind: StripKind): Level => {
    const page = app.page;
    const s = app.project.settings;
    if (kind === 'audio') {
      return { volume: page.audioVolume, muted: page.audioMuted, pan: page.audioPan, enabled: page.audioMediaId !== null };
    }
    if (kind === 'video') {
      return {
        volume: page.videoAudioVolume,
        muted: !page.videoAudioEnabled,
        pan: page.videoPan,
        enabled: page.videoMediaId !== null,
      };
    }
    return { volume: s.masterVolume, muted: s.masterMuted, pan: s.masterPan, enabled: true };
  };

  const setVolume = (kind: StripKind, volume: number, muted = level(kind).muted) => {
    if (kind === 'master') app.setMaster({ masterVolume: volume, masterMuted: muted });
    else app.setTrackLevel(kind, volume, muted);
  };
  const setPan = (kind: StripKind, pan: number) => {
    if (kind === 'master') app.setMaster({ masterPan: pan });
    else app.setTrackPan(kind, pan);
  };

  const strips = STRIPS.map(({ kind, name, reset }) => strip(kind, name, reset));
  const element = h('div', { class: 'mixer' }, ...strips.map((s) => s.element));

  function strip(kind: StripKind, name: string, reset: number) {
    const pan = h('input', {
      class: 'pan',
      type: 'range',
      min: -1,
      max: 1,
      step: 0.01,
      title: 'Pan (double-click to centre)',
      oninput: () => setPan(kind, Number(pan.value)),
      ondblclick: () => setPan(kind, 0),
    });
    const panValue = h('div', { class: 'pan-value' });
    const mute = h('button', { class: 'mute', onclick: () => setVolume(kind, level(kind).volume, !level(kind).muted) }, 'M');
    const thumb = h('div', { class: 'fader-thumb' });
    const fader = h(
      'div',
      { class: 'fader', title: 'Volume (double-click to reset)' },
      h('div', { class: 'fader-slot' }),
      ...FADER_TICKS.map((t) => h('span', { class: 'tick', style: `--at: ${t}` })),
      thumb,
    );
    const masks = [h('div', { class: 'meter-mask' }), h('div', { class: 'meter-mask' })];
    const value = h('div', { class: 'fader-value' });
    const element = h(
      'div',
      { class: `strip ${kind}` },
      h('div', { class: 'strip-name' }, name),
      pan,
      panValue,
      h(
        'div',
        { class: 'strip-body' },
        fader,
        h('div', { class: 'strip-meter' }, ...masks.map((mask) => h('div', { class: 'meter-bar' }, mask))),
      ),
      value,
      mute,
    );

    // Dragging moves the fader by the distance travelled, so grabbing it never makes it jump.
    fader.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !level(kind).enabled) return;
      e.preventDefault();
      fader.setPointerCapture(e.pointerId);
      const travel = fader.clientHeight - THUMB_PX;
      const startY = e.clientY;
      const startVolume = level(kind).volume;
      const move = (ev: PointerEvent) => {
        const volume = Math.min(1, Math.max(0, startVolume - (ev.clientY - startY) / travel));
        setVolume(kind, Math.round(volume * 100) / 100);
      };
      const up = () => {
        fader.removeEventListener('pointermove', move);
        fader.removeEventListener('pointerup', up);
        fader.removeEventListener('pointercancel', up);
      };
      fader.addEventListener('pointermove', move);
      fader.addEventListener('pointerup', up);
      fader.addEventListener('pointercancel', up);
    });
    fader.addEventListener('dblclick', () => {
      if (level(kind).enabled) setVolume(kind, reset);
    });

    function update(): void {
      const { volume, muted, pan: p, enabled } = level(kind);
      fader.style.setProperty('--fill', String(volume));
      fader.classList.toggle('disabled', !enabled);
      value.textContent = `${Math.round(volume * 100)}%`;
      pan.value = String(p);
      panValue.textContent = panLabel(p);
      pan.disabled = mute.disabled = !enabled;
      mute.classList.toggle('on', muted);
      mute.title = muted ? 'Unmute' : 'Mute';
    }

    const shown = [0, 0];
    let lastTick = performance.now();
    /** Peaks jump up at once and fall back smoothly. */
    function tick(): void {
      const now = performance.now();
      const fall = ((now - lastTick) / 1000) * METER_FALL_PER_SECOND;
      lastTick = now;
      app.transport.mixer.levels(kind).forEach((peak, i) => {
        shown[i] = Math.max(peak, shown[i] - fall);
        masks[i].style.height = `${(1 - shown[i]) * 100}%`;
      });
    }

    return { element, update, tick };
  }

  return {
    element,
    update: () => strips.forEach((s) => s.update()),
    tick: () => strips.forEach((s) => s.tick()),
  };
}
