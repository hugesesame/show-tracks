import { describe, expect, it } from 'vitest';
import { fullFrame, quarterFrames, rateCode } from '../src/engine/mtcMessages';

describe('rateCode', () => {
  it('maps each rate to its 2-bit MTC code', () => {
    expect(rateCode('24')).toBe(0);
    expect(rateCode('25')).toBe(1);
    expect(rateCode('29.97df')).toBe(2);
    expect(rateCode('30')).toBe(3);
  });
});

describe('fullFrame', () => {
  it('builds the SysEx with the rate in the hour byte', () => {
    expect(fullFrame({ h: 1, m: 2, s: 3, f: 4 }, '30')).toEqual([
      0xf0, 0x7f, 0x7f, 0x01, 0x01, 0x61, 0x02, 0x03, 0x04, 0xf7,
    ]);
    expect(fullFrame({ h: 23, m: 59, s: 59, f: 23 }, '24')).toEqual([
      0xf0, 0x7f, 0x7f, 0x01, 0x01, 0x17, 0x3b, 0x3b, 0x17, 0xf7,
    ]);
  });
});

describe('quarterFrames', () => {
  it('splits the timecode into 8 pieces in order', () => {
    // 17:42:35:27 at 29.97df: f=0x1b, s=0x23, m=0x2a, h=0x11, rate=2
    expect(quarterFrames({ h: 17, m: 42, s: 35, f: 27 }, '29.97df')).toEqual([
      [0xf1, 0x0b],
      [0xf1, 0x11],
      [0xf1, 0x23],
      [0xf1, 0x32],
      [0xf1, 0x4a],
      [0xf1, 0x52],
      [0xf1, 0x61],
      [0xf1, 0x75],
    ]);
  });

  it('encodes zero with the rate in the last piece', () => {
    const pieces = quarterFrames({ h: 0, m: 0, s: 0, f: 0 }, '25');
    expect(pieces.map((p) => p[1])).toEqual([0x00, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x72]);
  });
});
