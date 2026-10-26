import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex, parseHex } from '../src/ui/color';

describe('colour', () => {
  it('turns hue, saturation and brightness into hex', () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000');
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00ff00');
    expect(hsvToHex({ h: 240, s: 1, v: 0.5 })).toBe('#000080');
    expect(hsvToHex({ h: 200, s: 0, v: 1 })).toBe('#ffffff');
    expect(hsvToHex({ h: 200, s: 0.7, v: 0 })).toBe('#000000');
  });

  it('reads hex back into the same colour', () => {
    for (const hex of ['#ff0000', '#ffcc00', '#34c759', '#007aff', '#af52de', '#123456']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it('keeps the hue for greys', () => {
    expect(hexToHsv('#ffffff', 200)).toEqual({ h: 200, s: 0, v: 1 });
    expect(hexToHsv('#000000', 30).h).toBe(30);
  });

  it('accepts short, upper-case and bare hex, and nothing else', () => {
    expect(parseHex('#FFF')).toBe('#ffffff');
    expect(parseHex(' 3fa7ff ')).toBe('#3fa7ff');
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('red')).toBeNull();
  });
});
