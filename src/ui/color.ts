/** A colour as hue (0..360), saturation and brightness (0..1). */
export type Hsv = { h: number; s: number; v: number };

const hex2 = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${hex2(f(5))}${hex2(f(3))}${hex2(f(1))}`;
}

/** "#rgb" or "#rrggbb" (the # optional, any case) as "#rrggbb"; null when it is not a colour. */
export function parseHex(text: string): string | null {
  let hex = text.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(hex)) hex = [...hex].map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null;
}

/** `hex` as "#rrggbb"; `hue` is kept for greys and black, which have none of their own. */
export function hexToHsv(hex: string, hue = 0): Hsv {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = hue;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}
