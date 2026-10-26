import { hexToHsv, hsvToHex, parseHex, type Hsv } from './color';
import { h } from './dom';

const WHEEL = 180;
const SWATCHES = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de'];

/**
 * A swatch button that opens a round colour picker: hue around the wheel and
 * saturation out from its centre, a brightness slider, preset swatches and a hex field.
 */
export function colorButton(title: string, onPick: (hex: string) => void) {
  let current = '#ffffff';
  let hsv: Hsv = { h: 0, s: 0, v: 1 };

  const button = h('button', { type: 'button', class: 'memo-color', title, onclick: () => (popover.isConnected ? close() : open()) });

  const wheel = h('canvas', { class: 'picker-wheel', width: WHEEL * 2, height: WHEEL * 2 });
  // Darkens the wheel to the brightness chosen, so it shows the colours at hand.
  const dim = h('div', { class: 'picker-dim' });
  const handle = h('div', { class: 'picker-handle' });
  const wheelArea = h('div', { class: 'picker-wheel-area' }, wheel, dim, handle);
  const brightness = h('input', {
    type: 'range',
    class: 'picker-brightness',
    min: 0,
    max: 1,
    step: 0.01,
    title: 'Brightness',
    oninput: () => pick({ ...hsv, v: Number(brightness.value) }),
  });
  const swatches = SWATCHES.map((color) =>
    h('button', { type: 'button', class: 'picker-swatch', title: color, style: `background:${color}`, onclick: () => pickHex(color) }),
  );
  const hex = h('input', {
    type: 'text',
    class: 'picker-hex',
    spellcheck: false,
    maxLength: 7,
    onchange: () => {
      const color = parseHex(hex.value);
      if (color) pickHex(color);
      else hex.value = current;
    },
    onkeydown: (e: KeyboardEvent) => {
      if (e.key === 'Enter') hex.blur();
    },
  });
  const popover = h(
    'div',
    { class: 'picker' },
    wheelArea,
    h('div', { class: 'picker-label' }, 'Brightness'),
    brightness,
    h('div', { class: 'picker-swatches' }, ...swatches),
    hex,
  );
  drawWheel(wheel);

  // Hue is the angle (red at the right, going clockwise), saturation the distance from the centre.
  wheelArea.addEventListener('pointerdown', (e) => {
    wheelArea.setPointerCapture(e.pointerId);
    const fromPointer = (e: PointerEvent) => {
      const rect = wheelArea.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      // A colour chosen while all but black would not show, so it comes up to full brightness.
      pick({ h: hue, s: Math.min(1, Math.hypot(x, y) / (rect.width / 2)), v: hsv.v < 0.05 ? 1 : hsv.v });
    };
    fromPointer(e);
    const move = (e: PointerEvent) => fromPointer(e);
    const up = () => {
      wheelArea.removeEventListener('pointermove', move);
      wheelArea.removeEventListener('pointerup', up);
      wheelArea.removeEventListener('pointercancel', up);
    };
    wheelArea.addEventListener('pointermove', move);
    wheelArea.addEventListener('pointerup', up);
    wheelArea.addEventListener('pointercancel', up);
  });

  function pick(next: Hsv): void {
    hsv = next;
    current = hsvToHex(hsv);
    render();
    onPick(current);
  }

  function pickHex(color: string): void {
    pick(hexToHsv(color, hsv.h));
  }

  function render(): void {
    button.style.background = current;
    const angle = (hsv.h * Math.PI) / 180;
    handle.style.left = `${50 + Math.cos(angle) * hsv.s * 50}%`;
    handle.style.top = `${50 + Math.sin(angle) * hsv.s * 50}%`;
    handle.style.background = current;
    dim.style.opacity = String(1 - hsv.v);
    brightness.value = String(hsv.v);
    brightness.style.setProperty('--full', hsvToHex({ ...hsv, v: 1 }));
    if (document.activeElement !== hex) hex.value = current;
    for (const swatch of swatches) swatch.classList.toggle('active', swatch.title === current);
  }

  // Esc closes the picker rather than fading out the show; a click outside closes it too.
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    close();
  };
  const onOutside = (e: PointerEvent) => {
    if (!popover.contains(e.target as Node) && e.target !== button) close();
  };

  function open(): void {
    render();
    document.body.append(popover);
    // Below the button, or above it when there is no room; always inside the window.
    const at = button.getBoundingClientRect();
    const { width, height } = popover.getBoundingClientRect();
    const below = at.bottom + 6;
    popover.style.top = `${below + height < innerHeight - 8 ? below : Math.max(8, at.top - 6 - height)}px`;
    popover.style.left = `${Math.max(8, Math.min(at.left, innerWidth - width - 8))}px`;
    button.classList.add('active');
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
  }

  function close(): void {
    popover.remove();
    button.classList.remove('active');
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onOutside, true);
  }

  return {
    element: button,
    /** Shows `color` (from the settings); a disabled button closes its picker. */
    set(color: string, disabled: boolean): void {
      button.disabled = disabled;
      if (disabled) close();
      if (color === current) return;
      current = color;
      hsv = hexToHsv(color, hsv.h);
      render();
    },
  };
}

/** Every hue round the edge, fading to white at the centre, at full brightness. */
function drawWheel(canvas: HTMLCanvasElement): void {
  const size = canvas.width;
  const r = size / 2;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      const d = Math.hypot(dx, dy) / r;
      if (d > 1 + 1 / r) continue;
      const hex = hsvToHex({ h: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, s: Math.min(1, d), v: 1 });
      const n = parseInt(hex.slice(1), 16);
      const i = (y * size + x) * 4;
      image.data[i] = n >> 16;
      image.data[i + 1] = (n >> 8) & 255;
      image.data[i + 2] = n & 255;
      // A soft edge one pixel wide.
      image.data[i + 3] = Math.round(255 * Math.min(1, (1 - d) * r + 1));
    }
  }
  ctx.putImageData(image, 0, 0);
}
