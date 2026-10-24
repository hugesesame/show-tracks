const STORAGE_KEY = 'cue-player-layout';

type Sizes = { trackHeight: number; pagesWidth: number; monitorWidth: number };

/** PAGES starts as wide as the monitor, which fits the mixer's strips. */
const PANEL_WIDTH = 360;
const DEFAULTS: Sizes = { trackHeight: 232, pagesWidth: PANEL_WIDTH, monitorWidth: PANEL_WIDTH };
const MIN = { track: 120, lower: 140, pages: 120, cues: 240, monitor: 160 };

function load(): Sizes {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(sizes: Sizes): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    // Not remembering the layout is fine.
  }
}

/**
 * Draggable borders between the track and the lower panels, and between the
 * lower panels. Sizes are remembered in this browser only.
 */
export function createSplitters(main: HTMLElement, monitorMin: () => number = () => MIN.monitor) {
  const sizes = load();

  function apply(): void {
    // Keep every area usable, also after the window got smaller.
    const { width, height } = main.getBoundingClientRect();
    if (width > 0 && height > 0) {
      sizes.trackHeight = clamp(sizes.trackHeight, MIN.track, height - MIN.lower);
      // The monitor's minimum depends on what it shows: the mixer needs room for all its strips.
      const minMonitor = Math.max(MIN.monitor, monitorMin());
      sizes.pagesWidth = clamp(sizes.pagesWidth, MIN.pages, width - MIN.cues - minMonitor);
      sizes.monitorWidth = clamp(sizes.monitorWidth, minMonitor, width - sizes.pagesWidth - MIN.cues);
    }
    main.style.setProperty('--track-h', `${sizes.trackHeight}px`);
    main.style.setProperty('--pages-w', `${sizes.pagesWidth}px`);
    main.style.setProperty('--monitor-w', `${sizes.monitorWidth}px`);
  }

  function splitter(direction: 'row' | 'col', key: keyof Sizes, sign: 1 | -1): HTMLElement {
    const el = document.createElement('div');
    el.className = `splitter ${direction}`;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      const start = direction === 'row' ? e.clientY : e.clientX;
      const startSize = sizes[key];
      const move = (ev: PointerEvent) => {
        const now = direction === 'row' ? ev.clientY : ev.clientX;
        sizes[key] = startSize + sign * (now - start);
        apply();
      };
      const up = () => {
        el.classList.remove('dragging');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        save(sizes);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
    el.addEventListener('dblclick', () => {
      sizes[key] = DEFAULTS[key];
      apply();
      save(sizes);
    });
    el.title = 'Drag to resize, double-click to reset';
    return el;
  }

  window.addEventListener('resize', apply);
  return {
    apply,
    trackSplitter: splitter('row', 'trackHeight', 1),
    pagesSplitter: splitter('col', 'pagesWidth', 1),
    monitorSplitter: splitter('col', 'monitorWidth', -1),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
